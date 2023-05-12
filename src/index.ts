import { SubIterator } from "./sub-iterator/index.js";
import { LineIterator } from "./sub-iterator/line.js";
import { SizeIterator } from "./sub-iterator/size.js";
import { NeedleIterator } from "./sub-iterator/needle.js";
import { ChunkedHTTPBodyIterator } from "./sub-iterator/chunked-http-body.js";
import { ChunkedStreamIterator } from "./sub-iterator/chunked-stream.js";

// 本项目主要涉及以下五个概念：

// 1. 原始可迭代对象（rawIterable）：
// 类型是 AsyncIterable<Uint8Array>，即可提供 Uint8Array 类型数据的异步可迭代对象。
// 比如 Node.js 中的文件可读流，TCP Socket 等，但也不局限于 Node.js 的可读流，任何部署了 Symbol.asyncIterator 接口的对象都行，比如 Web Streams API 中的 ReadableStream，只要保证提供的数据是 Uint8Array 类型的就行。

// 2. 原始迭代器（rawIterator）：
// 类型是 AsyncIterator<Uint8Array, undefined>，即 rawIterable[Symbol.asyncIterator] 方法的返回值。
// 调用原始迭代器的 next 方法，其结果必须是 {done?: false, value: Uint8Array} 或 {done: true, value: undefined}

// 3. splitable：
// 实现了 AsyncIterator<Uint8Array, undefined> 接口，可以看做是一个迭代器，但它不直接向用户提供数据，而是作为原始迭代器的代理，起到数据缓冲层的作用，以及用于创建不同类型的子可迭代对象。

// 4. 子可迭代对象（subIterable）：
// 类型是 AsyncIterable<Uint8Array>，用户可以使用 forawaitof 来迭代这个对象，迭代这个对象等效于迭代原始可迭代对象。
// 每次迭代该对象获取到的都是原始数据中的一部分，同一个子可迭代对象可反复使用，但获取的数据不是同一部分，而是具备同一特征的不同部分。
// 比如我们通过执行 splitable.splitLine() 可以获取一个“行子可迭代对象”
// 第一次使用 forawaitof 循环迭代这个对象，迭代出的是原始数据的第一行，
// 当循环退出时，我们还可以再次使用 forawaitof 循环迭代这个对象，第二轮迭代得到的就是原始数据的第二行。
// 目前有三种类型的子可迭代对象，分别可以按行（遇到换行符结束），按大小，按 needle（遇到给定的子串结束）提供数据，不同类型的子可迭代对象可交叉使用，
// 比如我们再通过执行 splitable.splitSize(1024) 获取了一个“固定大小的子可迭代对象”，那么接着迭代这个对象我们可以获得第二行之后的 1024 字节的原始数据
// 子可迭代对象可以同时创建，创建顺序不影响迭代顺序，但不可以同时迭代，必须等前一轮迭代结束后，再启动下一轮迭代。

// 5. 子迭代器（subIterator）：
// 类型是 AsyncIterator<Uint8Array, undefined>，通过调用子可迭代对象的 Symbol.asyncIterator 接口获取

export function concat(chunks: Uint8Array[], length?: number): Uint8Array {
  if (chunks.length === 0) {
    return new Uint8Array();
  }

  if (chunks.length === 1) {
    return length === undefined ? chunks[0] : chunks[0].subarray(0, length);
  }

  const total = chunks.reduce((sum, chunk) => (sum += chunk.length), 0);
  const concated = new Uint8Array(length === undefined ? total : Math.min(total, length));
  for (let i = 0, offset = 0; i < chunks.length && offset < concated.length; i++) {
    const space = concated.length - offset;
    const chunk = space >= chunks[i].length ? chunks[i] : chunks[i].subarray(0, space);
    concated.set(chunk, offset);
    offset += chunk.length;
  }
  return concated;
}

export class Splitable implements AsyncIterator<Uint8Array, undefined> {
  // 原始迭代器
  rawIterator: AsyncIterator<Uint8Array, undefined>;
  // 进行中的子迭代器
  subIterators: Set<SubIterator> = new Set();
  // 用于暂存已从“原始迭代器”获取了，但还未被“子迭代器”排出的数据
  remain?: Uint8Array = undefined;
  // 用于标记原始迭代器是否已结束
  done: boolean = false;
  // 用于标记原始迭代器是否还有数据，this.done 是同步的，this.hasValue 是异步的
  // 通过 (await this.hasValue) 可以准确判断原始迭代器是否还有数据，this.done 并不能准确反应这一状态
  // 因为即使原始迭代器已经结束了，也只有当再次调用 next 方法时 this.done 才会更新成 true，简单说就是“没结束”并不代表“有数据”
  get hasValue() {
    return this.next().then((item) => {
      if (item.done) {
        return false;
      }
      this.remain = item.value;
      return true;
    });
  }

  constructor(rawIterable: AsyncIterable<Uint8Array>) {
    this.rawIterator = rawIterable[Symbol.asyncIterator]();
  }

  end() {
    if (this.done) {
      return;
    }
    this.done = true;
    this.remain = undefined;
    this.subIterators.forEach((subIterator) => subIterator.end());
    this.subIterators.clear();
  }

  // 用于从“原始迭代器”获取数据，该方法提供的数据必然是有效数据（非空）
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
        this.end();
        return { done: true, value: undefined };
      }
      if (item.value.length) {
        return item;
      }
      // 保证数据非空
      return this.next();
    });
  }

  // 用于向“原始迭代器”发送“不再需要数据”的请求
  async return(): Promise<IteratorResult<Uint8Array>> {
    this.end();
    if (this.rawIterator.return) {
      return this.rawIterator.return();
    }
    return { done: true, value: undefined };
  }

  // 用于向“原始迭代器”内部抛错误
  async throw(error?: any): Promise<IteratorResult<Uint8Array>> {
    this.end();
    if (this.rawIterator.throw) {
      return this.rawIterator.throw(error);
    }
    return Promise.reject(error);
  }

  // 遇到换行符（CRLF 或 LF）时结束，迭代出的数据不含换行符
  splitLine(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => new LineIterator(this),
    };
  }

  // 迭代出固定大小的数据后结束
  splitSize(size: number): AsyncIterable<Uint8Array> {
    if (typeof size === "number" && size >= 1 && Math.floor(size) === size) {
      return {
        [Symbol.asyncIterator]: () => new SizeIterator(this, size),
      };
    }

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    };
  }

  // 遇到 needle 时结束，迭代出的数据不含 needle
  splitBeforeNeedle(needle: Uint8Array): AsyncIterable<Uint8Array> {
    if (needle instanceof Uint8Array && needle.length) {
      return {
        [Symbol.asyncIterator]: () => new NeedleIterator(this, needle),
      };
    }

    return {
      [Symbol.asyncIterator]: () => ({
        async next() {
          return { done: true, value: undefined };
        },
      }),
    };
  }

  // 将采用 "Transfer-Encoding: chunked" 编码的 HTTP 消息体转化成一个异步可迭代对象
  splitChunkedHTTPBody(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => new ChunkedHTTPBodyIterator(this),
    };
  }

  // stream 是采用类似 HTTP chunked 编码方式的一段不定长字节流，它由任意个数的“普通区块”和一个“终止区块”组成
  // 每个区块的前 4 个字节用于声明该区块所含数据的大小，编码方式为“无符号 32 位整数（大端字节序）”，长度为 0 的区块为“终止区块”，该区块出现时代表 stream 结束。
  splitChunkedStream(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => new ChunkedStreamIterator(this),
    };
  }

  async readLine(maxSize: number = Infinity): Promise<Uint8Array> {
    const chunks = [];
    const subIterable = this.splitLine();
    let total = 0;
    for await (const chunk of subIterable) {
      if ((total += chunk.length) > maxSize) {
        throw new Error(`Size exceeded ${maxSize} bytes`);
      }
      chunks.push(chunk);
    }
    return concat(chunks, total);
  }

  async readSize(size: number): Promise<Uint8Array> {
    const chunks = [];
    const subIterable = this.splitSize(size);
    for await (const chunk of subIterable) {
      chunks.push(chunk);
    }
    return concat(chunks);
  }

  // 不同于 readSize 的地方在于，当获取到的数据不足 size 大小时会抛出错误，这种情况只会发生在还未获取到足够大小的数据时，原可迭代对象就结束了的时候
  async readEnoughSize(size: number): Promise<Uint8Array> {
    const concated = await this.readSize(size);
    if (concated.length !== size) {
      throw new Error("Don't have enough size of data");
    }
    return concated;
  }

  async readBeforeNeedle(needle: Uint8Array, maxSize: number = Infinity): Promise<Uint8Array> {
    const chunks = [];
    const subIterable = this.splitBeforeNeedle(needle);
    let total = 0;
    for await (const chunk of subIterable) {
      if ((total += chunk.length) > maxSize) {
        throw new Error(`Size exceeded ${maxSize} bytes`);
      }
      chunks.push(chunk);
    }
    return concat(chunks, total);
  }

  async readChunkedHTTPBody(maxSize: number = Infinity): Promise<Uint8Array> {
    const chunks = [];
    const subIterable = this.splitChunkedHTTPBody();
    let total = 0;
    for await (const chunk of subIterable) {
      if ((total += chunk.length) > maxSize) {
        throw new Error(`Size exceeded ${maxSize} bytes`);
      }
      chunks.push(chunk);
    }
    return concat(chunks, total);
  }

  async readChunkedStream(maxSize: number = Infinity): Promise<Uint8Array> {
    const chunks = [];
    const subIterable = this.splitChunkedStream();
    let total = 0;
    for await (const chunk of subIterable) {
      if ((total += chunk.length) > maxSize) {
        throw new Error(`Size exceeded ${maxSize} bytes`);
      }
      chunks.push(chunk);
    }
    return concat(chunks, total);
  }
}
