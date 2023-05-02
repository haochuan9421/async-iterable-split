import { SubIterator } from "./index.js";
import { Spliter } from "../index.js";

export class SizeIterator extends SubIterator {
  // 用于记录还有多少可用空间
  space: number;

  constructor(spliter: Spliter, size: number) {
    super(spliter);
    this.space = size;
  }

  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    if (this.spliter.subIterator === undefined) {
      this.spliter.subIterator = this;
    } else if (this.spliter.subIterator !== this) {
      this.end();
      return this.spliter
        .return()
        .catch(() => {
          /* 我们需要抛出自己的错误 */
        })
        .then(() => Promise.reject(new Error("Can't iterate multiple sub-iteratable in parallel")));
    }

    return this.spliter.next().then((item) => {
      if (item.done) {
        this.end();
        return item;
      }

      if (this.space > item.value.length) {
        this.space -= item.value.length;
        return item;
      }

      this.end();
      this.spliter.remain = item.value.subarray(this.space);
      return { done: false, value: item.value.subarray(0, this.space) };
    });
  }
}
