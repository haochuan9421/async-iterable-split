import { SubIterator } from "./index.js";
import { Splitable } from "../index.js";

export class ChunkedStreamIterator extends SubIterator {
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
      // 每个区块的前四个字节用于声明当前区块所含数据的大小
      this.chunkSize = new DataView((await this.splitable.readEnoughSize(4)).buffer).getUint32(0, false);
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
      throw new Error("Don't have enough size of data");
    }
    // 如果大小一致则更新内部状态，继续读取下一个的区块，直到遇到空区块为止
    this.chunkSize = 0;
    this.chunkRealSize = 0;
    return this.next();
  }
}
