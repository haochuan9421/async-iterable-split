import { SubIterator } from "./index.js";
import { Splitable } from "../index.js";

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

export class ChunkedHTTPBodyIterator extends SubIterator {
  chunkSize: number = 0;
  chunkRealSize: number = 0;
  chunkIterator?: AsyncIterator<Uint8Array, undefined>;

  constructor(splitable: Splitable) {
    super(splitable);
  }

  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    if (this.chunkSize === 0) {
      // 区块的第一行包含 chunk-size 和 chunk-ext，
      // chunk-size 采用 16进制表示，
      // chunk-ext 是拓展参数，用来传递和区块相关的一些信息，比如 hash 值，chunk-ext 是可选的，且很少被用到，所以我们提取数据时忽略 chunk-ext。
      const chunkLine = await this.splitable.readLine(16384 /* 限制第一行最多包含 16 KB 的数据，这是为了避免内存泄漏 */);
      const hexs = [];
      for (const byte of chunkLine) {
        if (ascii2decimal.has(byte)) {
          hexs.unshift(ascii2decimal.get(byte) as number);
        } else {
          // chunk-size 和 chunk-ext 被 ";" 隔开的，";" 前面可能也有空格，所以遇到非 0-9，A-F，a-f 的字符时就可以跳出了
          break;
        }
      }
      // RFC9112 规范中并未限制 chunk-size 的最大值，但 JS 的 number 类型本质是 IEEE754 双精度浮点数，所以能表示的最大安全整数是 2^53 - 1，对应的 16 进制就是 1fffffffffffff，
      // 我们获取 chunk-size 时，如果这个值超过了 1fffffffffffff 就抛出错误。也即 chunk-size 最大只允许 16777216 TB，正常业务下，这个上限不太可能被触碰到，就没必要使用 bigint 了。
      if (hexs.length === 0) {
        throw new Error("Missing chunk size");
      }
      if (hexs.length > 14 || (hexs.length === 14 && hexs[13] > 1)) {
        throw new Error("Chunk size exceeded Number.MAX_SAFE_INTEGER");
      }
      this.chunkSize = 0;
      for (let i = 0; i < hexs.length; i++) {
        this.chunkSize += hexs[i] * Math.pow(16, i);
      }
      // 如果遇到了空区块，则表示字节流结束了
      if (this.chunkSize === 0) {
        this.end();
        return { done: true, value: undefined };
      }
      // 创建子异步迭代器，用于获取当前区块所含的数据
      this.chunkIterator = this.splitable.splitSize(this.chunkSize)[Symbol.asyncIterator]();
    }

    const item = await this.chunkIterator!.next();
    if (!item.done) {
      this.chunkRealSize += item.value.length;
      return item;
    }

    // 当区块结束时，先判断已从该区块获取到的数据大小和其声明的大小是否一致，如果不一致则抛出错误
    if (this.chunkRealSize !== this.chunkSize) {
      return Promise.reject(new Error("Don't have enough size of data"));
    }
    // 如果大小一致则更新内部状态，继续读取下一个的区块，直到遇到空区块为止
    this.chunkSize = 0;
    this.chunkRealSize = 0;
    // chunk-data 后面还有一个换行符
    return this.splitable.readLine(0).then(() => this.next());
  }
}
