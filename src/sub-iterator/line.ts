import { SubIterator } from "./index.js";
import { Spliter } from "../index.js";

export class LineIterator extends SubIterator {
  constructor(spliter: Spliter) {
    super(spliter);
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

      // CR=13 LF=10
      const lf = item.value.indexOf(10);

      // 如果找到了 LF，则将 LF 后面的数据暂存到 spliter.remain 中以备后用，并把 LF 前面的数据返回（如果 LF 前面还有 CR，返回的数据需去掉 CR）
      if (lf !== -1) {
        this.end();
        this.spliter.remain = item.value.subarray(lf + 1);
        const cr = Math.max(0, lf - 1);
        return { done: false, value: item.value.subarray(0, item.value[cr] === 13 ? cr : lf) };
      }

      // 如果没找到 LF 且最后一个字节不是 CR，直接返回整块数据
      if (item.value[item.value.length - 1] !== 13) {
        return item;
      }

      // 如果没找到 LF 但最后一个字节是 CR，需要再请求一块数据综合判断
      return this.spliter.next().then((nextItem) => {
        // 如果原始迭代器已经结束了，则直接返回整块数据
        if (nextItem.done) {
          this.end();
          return item;
        } else if (nextItem.value[0] === 10) {
          // 如果后面紧跟着一个 LF，说明匹配到 CRLF 了，将 CRLF 后面的数据转移到 spliter.remain，前面的数据返回
          this.end();
          this.spliter.remain = nextItem.value.subarray(1);
          return { done: false, value: item.value.subarray(0, item.value.length - 1) };
        } else {
          // 如果后面不是 LF，则当前的数据块可以整个返回，后面的数据块转移到 spliter.remain 中
          this.spliter.remain = nextItem.value;
          return item;
        }
      });
    });
  }
}
