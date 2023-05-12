import { SubIterator } from "./index.js";
import { Splitable } from "../index.js";

export class SizeIterator extends SubIterator {
  // 用于记录还有多少可用空间
  space: number;

  constructor(splitable: Splitable, size: number) {
    super(splitable);
    this.space = size;
  }

  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    return this.splitable.next().then((item) => {
      if (item.done) {
        this.end();
        return item;
      }

      if (this.space > item.value.length) {
        this.space -= item.value.length;
        return item;
      }

      this.end();
      this.splitable.remain = item.value.subarray(this.space);
      return { done: false, value: item.value.subarray(0, this.space) };
    });
  }
}
