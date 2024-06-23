// 本项目主要涉及以下四个概念：

// 1. 原始可迭代对象（rawIterable）：
// 类型是 AsyncIterable<Uint8Array>，即可提供 Uint8Array 类型数据的异步可迭代对象。
// 比如 Node.js 中的文件可读流，TCP Socket 等，但也不局限于 Node.js，任何部署了 Symbol.asyncIterator 接口且提供的数据是 Uint8Array 类型的对象都可以用于创建 splitable。

// 2. 原始迭代器（rawIterator）：
// 类型是 AsyncIterator<Uint8Array>，即 rawIterable[Symbol.asyncIterator]() 的返回值。

// 3. splitable：
// 实现了 AsyncIterableIterator<Uint8Array> 接口，既可以看作是异步可迭代对象也可以看作是异步迭代器，
// 一般不直接通过该对象获取数据，而是通过它创建不同类型的子迭代器，从而间接的获取数据。
// 如果迭代完某个子迭代器后，依然想获取原始迭代器中剩余的数据，则可以通过迭代 splitable 来实现。

// 4. 子迭代器（subIterator）：
// 类型是 AsyncIterableIterator<Uint8Array>，可通过 splitable.splitXXX 方法创建，迭代子迭代器可以获取原始数据中的特定部分。
// 比如我们通过 splitable.splitLine() 可以创建一个“行子迭代器”，迭代该子迭代器可以获取原始数据中的一行。
// 再比如我们通过 splitable.splitSize(1024) 可以创建了一个“固定大小的子迭代器”，迭代该子迭代器可以获取原始数据中的 1024 个字节（如果原始迭代器中剩余的数据不足 1024 字节，则获取剩余的全部数据）。

export function concat(iterable: Iterable<Uint8Array>): Uint8Array {
  const chunks = Array.isArray(iterable) ? iterable : Array.from(iterable);
  let size = 0;
  for (let i = 0; i < chunks.length; i++) {
    size += chunks[i].length;
  }
  const concated = new Uint8Array(size);
  for (let i = 0, offset = 0; i < chunks.length; i++) {
    concated.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return concated;
}

export async function asyncConcat(iterable: AsyncIterableIterator<Uint8Array>, maxSize: number = Infinity): Promise<Uint8Array> {
  let chunks = [];
  let size = 0;
  let item;
  while (!(item = await iterable.next()).done) {
    if ((size += item.value.length) > maxSize) {
      throw new Error(`Size exceeded ${maxSize} bytes`);
    }
    chunks.push(item.value);
  }
  return concat(chunks);
}

export class Splitable implements AsyncIterableIterator<Uint8Array> {
  // 原始迭代器
  private rawIterator: AsyncIterator<Uint8Array>;
  // 用于暂存已从“原始迭代器”获取了，但还未“排出”的数据
  private remain?: Uint8Array = undefined;
  // 用于标记整个迭代过程是否已结束
  private done: boolean = false;

  constructor(rawIterable: AsyncIterable<Uint8Array>) {
    this.rawIterator = rawIterable[Symbol.asyncIterator]();
  }

  // 用户可通过该方法判断是否还可以迭代出数据，该方法是异步的
  // 注意：this.done 并不能作为“是否还可以迭代出数据”的判断依据，因为即使当 this.done 为 false 时，下次迭代的结果也可以是 {done: true, value: undefined}
  async hasValue() {
    return this.next().then((item) => {
      if (item.done) {
        return false;
      }
      this.remain = item.value;
      return true;
    });
  }

  // 用于从“原始迭代器”获取数据，该方法提供的数据必然是非空数据
  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    if (this.remain?.length) {
      const item = { done: false, value: this.remain };
      this.remain = undefined;
      return item;
    }

    return this.rawIterator.next().then((item) => {
      if (item.done) {
        this.done = true;
        this.remain = undefined;
        return item;
      }
      if (item.value.length) {
        return item;
      }
      // 保证数据非空
      return this.next();
    });
  }

  // 用于向“原始迭代器”发送“不再需要数据”的请求
  async return(value?: any): Promise<IteratorResult<Uint8Array>> {
    if (this.rawIterator.return) {
      return this.rawIterator.return(value).then((item) => {
        if (item.done) {
          this.done = true;
          this.remain = undefined;
        }
        return item;
      });
    }
    this.done = true;
    this.remain = undefined;
    return { done: true, value };
  }

  // 用于向“原始迭代器”内部抛错误
  async throw(error?: any): Promise<IteratorResult<Uint8Array>> {
    if (this.rawIterator.throw) {
      return this.rawIterator.throw(error).then((item) => {
        if (item.done) {
          this.done = true;
          this.remain = undefined;
        }
        return item;
      });
    }
    this.done = true;
    this.remain = undefined;
    return Promise.reject(error);
  }

  // 遇到换行符（CRLF 或 LF）时结束，迭代出的数据不含换行符
  splitLine(): AsyncIterableIterator<Uint8Array> {
    const splitable = this;
    let done = false;

    return {
      async next() {
        if (done) {
          return { done: true, value: undefined };
        }

        return splitable.next().then((item) => {
          if (item.done) {
            done = true;
            return item;
          }

          // CR=13 LF=10
          const lf = item.value.indexOf(10);

          // 如果找到了 LF，则将 LF 后面的数据暂存到 splitable.remain 中以备后用，并把 LF 前面的数据返回（如果 LF 前面还有 CR，返回的数据需去掉 CR）
          if (lf !== -1) {
            done = true;
            splitable.remain = item.value.subarray(lf + 1);
            const cr = Math.max(0, lf - 1);
            return {
              done: false,
              value: item.value.subarray(0, item.value[cr] === 13 ? cr : lf),
            };
          }

          // 如果没找到 LF 且最后一个字节不是 CR，直接返回整块数据
          if (item.value[item.value.length - 1] !== 13) {
            return item;
          }

          // 如果没找到 LF 但最后一个字节是 CR，需要再请求一块数据综合判断
          return splitable.next().then((nextItem) => {
            // 如果原始迭代器已经结束了，则直接返回整块数据
            if (nextItem.done) {
              done = true;
              return item;
            } else if (nextItem.value[0] === 10) {
              // 如果后面紧跟着一个 LF，说明匹配到 CRLF 了，将 CRLF 后面的数据转移到 splitable.remain，前面的数据返回
              done = true;
              splitable.remain = nextItem.value.subarray(1);
              return {
                done: false,
                value: item.value.subarray(0, item.value.length - 1),
              };
            } else {
              // 如果后面不是 LF，则当前的数据块可以整个返回，后面的数据块转移到 splitable.remain 中
              splitable.remain = nextItem.value;
              return item;
            }
          });
        });
      },
      async return(value?: any) {
        return splitable.return(value).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      async throw(error?: any) {
        return splitable.throw(error).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  // 迭代出固定大小的数据后结束
  splitSize(size: number): AsyncIterableIterator<Uint8Array> {
    // size 必须是非负整数
    if (typeof size === "number" && size >= 0 && Math.floor(size) === size) {
      const splitable = this;
      let done = false;

      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          if (done) {
            return { done: true, value: undefined };
          }

          return splitable.next().then((item) => {
            if (item.done) {
              done = true;
              return item;
            }

            if (size > item.value.length) {
              size -= item.value.length;
              return item;
            }

            done = true;
            splitable.remain = item.value.subarray(size);
            return { done: false, value: item.value.subarray(0, size) };
          });
        },
        async return(value?: any) {
          return splitable.return(value).then((item) => {
            if (item.done) {
              done = true;
            }
            return item;
          });
        },
        async throw(error?: any) {
          return splitable.throw(error).then((item) => {
            if (item.done) {
              done = true;
            }
            return item;
          });
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    }

    throw new Error("Invalid size");
  }

  // 遇到 needle 时结束，迭代出的数据不含 needle
  splitBeforeNeedle(needle: Uint8Array): AsyncIterableIterator<Uint8Array> {
    // needle 必须是 Uint8Array 类型的，且不能为空
    if (needle instanceof Uint8Array && needle.length) {
      const splitable = this;
      let done = false;
      // 搜索过程采用的是 horspool 算法，move 数组的 index 表示的是某个字节的值，也即 [0, 255]
      // 当失配时，我们取当前轮次目标串的最后一个字节，找到该字节在 move 中的值，这个值就是下一轮匹配需要移动的距离
      const move = new Array(256).fill(needle.length);
      for (let i = 0; i < needle.length - 1; i++) {
        move[needle[i]] = needle.length - 1 - i;
      }

      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          if (done) {
            return { done: true, value: undefined };
          }

          const haystack = await splitable.eagerLoad(needle.length);

          if (haystack.length < needle.length) {
            // 如果目标串还没模式串长，那必然无法匹配，直接返回
            done = true;
            return haystack.length === 0 ? { done: true, value: undefined } : { done: false, value: haystack };
          }

          let index = -1; // index 是匹配成功的位置
          let offset = 0; // offset 是每轮开始的位置

          while (offset <= haystack.length - needle.length) {
            let i = offset;
            let j = 0;
            while (j < needle.length && haystack[i] === needle[j]) {
              i++;
              j++;
            }
            if (j === needle.length) {
              index = offset;
              break;
            }
            offset += move[haystack[offset + needle.length - 1]];
          }

          if (index !== -1) {
            // 如果匹配成功了，匹配成功位置前面的内容返回，后面的内容转移到 splitable.remain 以备后用
            done = true;
            splitable.remain = haystack.subarray(index + needle.length);
            return { done: false, value: haystack.subarray(0, index) };
          }

          // 如果匹配失败了，则此时的 offset 是之后匹配的起点，offset 之前的内容是必然无法匹配的，可以直接返回了，之后的内容转移到 splitable.remain 以备后用
          splitable.remain = haystack.subarray(offset);
          return { done: false, value: haystack.subarray(0, offset) };
        },
        async return(value?: any) {
          return splitable.return(value).then((item) => {
            if (item.done) {
              done = true;
            }
            return item;
          });
        },
        async throw(error?: any) {
          return splitable.throw(error).then((item) => {
            if (item.done) {
              done = true;
            }
            return item;
          });
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    }

    throw new Error("Invalid needle");
  }

  // 将采用 "Transfer-Encoding: chunked" 编码的 HTTP 消息体转化成一个异步可迭代对象
  splitChunkedHTTPBody(): AsyncIterableIterator<Uint8Array> {
    const splitable = this;
    let done = false;
    let chunkSize: number = 0;
    let chunkRealSize: number = 0;
    let chunkIterator: AsyncIterableIterator<Uint8Array>;
    const ascii2decimal = new Map([
      // 0-9
      [48, 0],
      [49, 1],
      [50, 2],
      [51, 3],
      [52, 4],
      [53, 5],
      [54, 6],
      [55, 7],
      [56, 8],
      [57, 9],
      // A-F
      [65, 10],
      [66, 11],
      [67, 12],
      [68, 13],
      [69, 14],
      [70, 15],
      // a-f
      [97, 10],
      [98, 11],
      [99, 12],
      [100, 13],
      [101, 14],
      [102, 15],
    ]);

    return {
      async next(): Promise<IteratorResult<Uint8Array>> {
        if (done) {
          return { done: true, value: undefined };
        }

        if (chunkSize === 0) {
          // 区块的第一行包含 chunk-size 和 chunk-ext，
          // chunk-size 采用 16进制表示，
          // chunk-ext 是拓展参数，用来传递和区块相关的一些元数据，比如区块的 hash 值，chunk-ext 是可选的，且很少被用到，所以我们提取数据时忽略 chunk-ext。
          const chunkLine = await splitable.readLine(16384 /* 限制第一行最多包含 16 KB 的数据，这是为了避免内存泄漏 */);
          const hexs: number[] = [];
          for (const byte of chunkLine) {
            if (ascii2decimal.has(byte)) {
              hexs.unshift(ascii2decimal.get(byte)!);
            } else {
              // chunk-size 和 chunk-ext 被 ";" 隔开的，";" 前面可能也有空格，我们不关注这个字符具体是什么，只要不是 0-9，A-F，a-f 就跳出
              break;
            }
          }
          // RFC9112 规范中并未限制 chunk-size 的最大值，但 JS 的 number 类型本质是 IEEE754 双精度浮点数，所以能表示的最大安全整数是 2^53 - 1，对应的 16 进制就是 1fffffffffffff，
          // 我们获取 chunk-size 时，如果这个值超过了 1fffffffffffff 就抛出错误。也即 chunk-size 最大只允许 16777216 TB，正常业务下，这个上限不太可能被触碰到，就没必要使用 bigint 了。
          if (hexs.length === 0) {
            throw new Error("Missing chunk size");
          }
          if (hexs.length > 14 /* '1fffffffffffff'.length */ || (hexs.length === 14 && hexs[13] > 1)) {
            throw new Error("Chunk size exceeded Number.MAX_SAFE_INTEGER");
          }
          chunkSize = 0;
          for (let i = 0; i < hexs.length; i++) {
            chunkSize += hexs[i] * Math.pow(16, i);
          }
          // 如果遇到了空区块，则表示字节流结束了
          if (chunkSize === 0) {
            done = true;
            // 虽然 chunk-data 是空的，但是它的尾部还有一个换行符，需要手动把这个换行符消耗掉
            return splitable.readLine(0).then(() => ({ done: true, value: undefined }));
          }
          // 创建子异步迭代器，用于获取当前区块所含的数据
          chunkIterator = splitable.splitSize(chunkSize);
        }

        const item = await chunkIterator.next();
        if (!item.done) {
          chunkRealSize += item.value.length;
          return item;
        }

        // 当区块结束时，先判断已从该区块获取到的数据大小和其声明的大小是否一致，如果不一致则抛出错误
        if (chunkRealSize !== chunkSize) {
          return Promise.reject(new Error("Don't have enough size of data"));
        }
        // 如果大小一致则更新内部状态，继续读取下一个的区块，直到遇到空区块为止
        chunkSize = 0;
        chunkRealSize = 0;
        // chunk-data 后面还有一个换行符，需要手动把这个换行符消耗掉
        return splitable.readLine(0).then(() => this.next());
      },
      async return(value?: any) {
        return splitable.return(value).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      async throw(error?: any) {
        return splitable.throw(error).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  // "Stream" 是采用类似 HTTP chunked 编码方式的一段不定长字节流，它由任意个数的“普通区块”和一个“终止区块”组成
  // 每个区块的前 4 个字节用于声明该区块所含数据的大小，编码方式为“无符号 32 位整数（大小端字节序都支持）”，长度为 0 的区块为“终止区块”，该区块出现时代表 "Stream" 结束。
  splitChunkedStream(littleEndian: boolean = false): AsyncIterableIterator<Uint8Array> {
    const splitable = this;
    let done = false;
    let chunkSize: number = 0;
    let chunkRealSize: number = 0;
    let chunkIterator: AsyncIterableIterator<Uint8Array>;

    return {
      async next(): Promise<IteratorResult<Uint8Array>> {
        if (done) {
          return { done: true, value: undefined };
        }

        if (chunkSize === 0) {
          // 每个区块的前四个字节用于声明当前区块所含数据的大小
          chunkSize = new DataView((await splitable.readEnoughSize(4)).buffer).getUint32(0, littleEndian);
          // 如果遇到了空区块，则表示字节流结束了
          if (chunkSize === 0) {
            done = true;
            return { done: true, value: undefined };
          }
          // 创建子异步迭代器，用于获取当前区块所含的数据
          chunkIterator = splitable.splitSize(chunkSize);
        }

        const item = await chunkIterator.next();
        if (!item.done) {
          chunkRealSize += item.value.length;
          return item;
        }

        // 当区块结束时，先判断已从该区块获取到的数据大小和其声明的大小是否一致，如果不一致则抛出错误
        if (chunkRealSize !== chunkSize) {
          throw new Error("Don't have enough size of data");
        }
        // 如果大小一致则更新内部状态，继续读取下一个的区块，直到遇到空区块为止
        chunkSize = 0;
        chunkRealSize = 0;
        return this.next();
      },
      async return(value?: any) {
        return splitable.return(value).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      async throw(error?: any) {
        return splitable.throw(error).then((item) => {
          if (item.done) {
            done = true;
          }
          return item;
        });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  async readLine(maxSize: number = Infinity): Promise<Uint8Array> {
    return asyncConcat(this.splitLine(), maxSize);
  }

  async readSize(size: number): Promise<Uint8Array> {
    return asyncConcat(this.splitSize(size));
  }

  // 不同于 readSize 的地方在于，当获取到的数据不足 size 大小时会抛出错误，这种情况只会发生在还未获取到足够大小的数据时，原可迭代对象就结束了的时候
  async readEnoughSize(size: number): Promise<Uint8Array> {
    const concated = await asyncConcat(this.splitSize(size));
    if (concated.length < size) {
      throw new Error("Don't have enough size of data");
    }
    return concated;
  }

  async readBeforeNeedle(needle: Uint8Array, maxSize: number = Infinity): Promise<Uint8Array> {
    return asyncConcat(this.splitBeforeNeedle(needle), maxSize);
  }

  async readChunkedHTTPBody(maxSize: number = Infinity): Promise<Uint8Array> {
    return asyncConcat(this.splitChunkedHTTPBody(), maxSize);
  }

  async readChunkedStream(littleEndian: boolean = false, maxSize: number = Infinity): Promise<Uint8Array> {
    return asyncConcat(this.splitChunkedStream(littleEndian), maxSize);
  }

  // 提前加载至少 expect 字节的数据
  private async eagerLoad(expect: number): Promise<Uint8Array> {
    const item = await this.next();
    if (item.done) {
      return new Uint8Array(0);
    }

    if (item.value.length >= expect) {
      return item.value;
    }

    let chunks = [item.value];
    let chunksLen = item.value.length;
    while (chunksLen < expect) {
      const moreItem = await this.next();
      if (moreItem.done) {
        break;
      }
      chunks.push(moreItem.value);
      chunksLen += moreItem.value.length;
    }
    const concated = new Uint8Array(chunksLen);
    for (let i = 0, offset = 0; i < chunks.length; i++) {
      concated.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return concated;
  }

  [Symbol.asyncIterator]() {
    return this;
  }
}
