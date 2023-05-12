import { SubIterator } from "./index.js";
import { Splitable } from "../index.js";

export class LineIterator extends SubIterator {
  constructor(splitable: Splitable) {
    super(splitable);
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

      // CR=13 LF=10
      const lf = item.value.indexOf(10);

      // 如果找到了 LF，则将 LF 后面的数据暂存到 splitable.remain 中以备后用，并把 LF 前面的数据返回（如果 LF 前面还有 CR，返回的数据需去掉 CR）
      if (lf !== -1) {
        this.end();
        this.splitable.remain = item.value.subarray(lf + 1);
        const cr = Math.max(0, lf - 1);
        return { done: false, value: item.value.subarray(0, item.value[cr] === 13 ? cr : lf) };
      }

      // 如果没找到 LF 且最后一个字节不是 CR，直接返回整块数据
      if (item.value[item.value.length - 1] !== 13) {
        return item;
      }

      // 如果没找到 LF 但最后一个字节是 CR，需要再请求一块数据综合判断
      return this.splitable.next().then((nextItem) => {
        // 如果原始迭代器已经结束了，则直接返回整块数据
        if (nextItem.done) {
          this.end();
          return item;
        } else if (nextItem.value[0] === 10) {
          // 如果后面紧跟着一个 LF，说明匹配到 CRLF 了，将 CRLF 后面的数据转移到 splitable.remain，前面的数据返回
          this.end();
          this.splitable.remain = nextItem.value.subarray(1);
          return { done: false, value: item.value.subarray(0, item.value.length - 1) };
        } else {
          // 如果后面不是 LF，则当前的数据块可以整个返回，后面的数据块转移到 splitable.remain 中
          this.splitable.remain = nextItem.value;
          return item;
        }
      });
    });
  }
}
