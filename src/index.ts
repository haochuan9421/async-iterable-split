import { SubIterator } from "./sub-iterator/index.js";
import { LineIterator } from "./sub-iterator/line.js";
import { SizeIterator } from "./sub-iterator/size.js";
import { NeedleIterator } from "./sub-iterator/needle.js";

// 本项目主要涉及以下五个概念：

// 1. 原始可迭代对象（rawIterable）：
// 类型是 AsyncIterable<Uint8Array>，即可提供 Uint8Array 类型数据的异步可迭代对象。
// 比如 Node.js 中的文件可读流，TCP Socket 等，但也不局限于 Node.js 的可读流，任何部署了 Symbol.asyncIterator 接口的对象都行，比如 Web Streams API 中的 ReadableStream，只要保证提供的数据是 Uint8Array 类型的就行。

// 2. 原始迭代器（rawIterator）：
// 类型是 AsyncIterator<Uint8Array, undefined>，即 rawIterable[Symbol.asyncIterator] 方法的返回值。
// 调用原始迭代器的 next 方法，其结果必须是 {done?: false, value: Uint8Array} 或 {done: true, value: undefined}

// 3. spliter：
// 实现了 AsyncIterator<Uint8Array, undefined> 接口，可以看做是一个迭代器，但它不直接向用户提供数据，而是作为原始迭代器的代理，起到数据缓冲层的作用，以及用于创建不同类型的子可迭代对象。

// 4. 子可迭代对象：
// 类型是 AsyncIterable<Uint8Array>，用户可以使用 forawaitof 来迭代这个对象，迭代这个对象等效于迭代原始可迭代对象。
// 每次迭代该对象获取到的都是原始数据中的一部分，同一个子可迭代对象可反复使用，但获取的数据不是同一部分，而是具备同一特征的不同部分。
// 比如我们通过执行 spliter.splitByLine() 可以获取一个“行子可迭代对象”
// 第一次使用 forawaitof 循环迭代这个对象，迭代出的是原始数据的第一行，
// 当循环退出时，我们还可以再次使用 forawaitof 循环迭代这个对象，第二轮迭代得到的就是原始数据的第二行。
// 目前有三种类型的子可迭代对象，分别可以按行（遇到换行符结束），按大小，按 needle（遇到给定的子串结束）提供数据，不同类型的子可迭代对象可交叉使用，
// 比如我们再通过执行 spliter.splitBySize(1024) 获取了一个“固定大小的子可迭代对象”，那么接着迭代这个对象我们可以获得第二行之后的 1024 字节的原始数据
// 子可迭代对象可以同时创建，创建顺序不影响迭代顺序，但不可以同时迭代，必须等前一轮迭代结束后，再启动下一轮迭代。

// 5. 子迭代器（subIterator）：
// 类型是 AsyncIterator<Uint8Array, undefined>，通过调用子可迭代对象的 Symbol.asyncIterator 接口获取

const hasValue = Symbol("hasValue");

export class Spliter implements AsyncIterator<Uint8Array, undefined> {
  // 原始迭代器
  rawIterator: AsyncIterator<Uint8Array, undefined>;
  // 进行中的子迭代器
  subIterator?: SubIterator = undefined;
  // 用于暂存已从“原始迭代器”获取了，但还未被“子迭代器”排出的数据
  remain?: Uint8Array = undefined;
  // 用于标记原始迭代器是否已结束
  done: boolean = false;
  // 用于标记原始迭代器是否还有数据，this.done 是同步的，this.hasValue 是异步的
  // 通过 (await this.hasValue) 可以准确判断原始迭代器是否还有数据，this.done 并不能准确反应这一状态
  // 因为即使原始迭代器已经结束了，也只有当再次调用 next 方法时 this.done 才会更新成 true，简单说就是“没结束”并不代表“有数据”
  private [hasValue]?: Promise<boolean> = undefined;
  get hasValue() {
    if (this[hasValue]) {
      return this[hasValue];
    }
    return (this[hasValue] = new Promise<boolean>((resolve, reject) => {
      if (this.done) {
        resolve(false);
      } else {
        this.next()
          .then((item) => {
            if (item.done) {
              resolve(false);
            } else {
              this.remain = item.value;
              resolve(true);
            }
          })
          .catch(reject);
      }
    }).finally(() => {
      this[hasValue] = undefined;
    }));
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
    if (this.subIterator) {
      this.subIterator.end();
      this.subIterator = undefined;
    }
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
  splitByLine(): AsyncIterable<Uint8Array> {
    return {
      [Symbol.asyncIterator]: () => new LineIterator(this),
    };
  }

  // 迭代出固定大小的数据后结束
  splitBySize(size: number): AsyncIterable<Uint8Array> {
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
  splitByNeedle(needle: Uint8Array): AsyncIterable<Uint8Array> {
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
}
