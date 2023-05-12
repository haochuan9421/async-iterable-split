import { SubIterator } from "./index.js";
import { Splitable } from "../index.js";

export class NeedleIterator extends SubIterator {
  needle: Uint8Array;
  move: Array<number>;

  constructor(splitable: Splitable, needle: Uint8Array) {
    super(splitable);
    // 搜索过程采用的是 horspool 算法，this.move 数组的 index 表示的是某个字节的值，也即 [0, 255]
    // 当失配时，我们取当前轮次目标串的最后一个字节，找到该字节在 this.move 中的值，这个值就是下一轮匹配需要移动的距离
    this.needle = needle;
    this.move = new Array(256).fill(needle.length);
    for (let i = 0; i < needle.length - 1; i++) {
      this.move[needle[i]] = needle.length - 1 - i;
    }
  }

  async next(): Promise<IteratorResult<Uint8Array>> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    const haystack = await this.fetchHaystack(this.needle.length);

    if (haystack.length < this.needle.length) {
      // 如果目标串还没模式串长，那必然无法匹配，直接返回
      this.end();
      return haystack.length === 0 ? { done: true, value: undefined } : { done: false, value: haystack };
    }

    let index = -1;
    let offset = 0;

    while (offset <= haystack.length - this.needle.length) {
      let i = offset;
      let j = 0;

      while (j < this.needle.length && haystack[i] === this.needle[j]) {
        i++;
        j++;
      }

      if (j === this.needle.length) {
        index = offset;
        break;
      }

      offset += this.move[haystack[offset + this.needle.length - 1]];
    }

    if (index !== -1) {
      // 如果匹配成功了，模式串前面的内容返回，后面的内容转移到 splitable.remain 以备后用
      this.end();
      this.splitable.remain = haystack.subarray(index + this.needle.length);
      return { done: false, value: haystack.subarray(0, index) };
    }

    // 如果匹配失败了，则此时的 offset 是之后匹配的起点，offset 之前的内容是必然无法匹配的，可以直接返回了，之后的内容转移到 splitable.remain 以备后用
    this.splitable.remain = haystack.subarray(offset);
    return { done: false, value: haystack.subarray(0, offset) };
  }

  async fetchHaystack(least: number): Promise<Uint8Array> {
    const item = await this.splitable.next();
    if (item.done) {
      return new Uint8Array(0);
    }

    if (item.value.length >= least) {
      return item.value;
    }

    const chunks = [item.value];
    let chunksLen = item.value.length;
    while (chunksLen < least) {
      const moreItem = await this.splitable.next();
      if (moreItem.done) {
        break;
      }
      chunks.push(moreItem.value);
      chunksLen += moreItem.value.length;
    }
    const concated = new Uint8Array(chunksLen);
    for (let i = 0, offset = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      concated.set(chunk, offset);
      offset += chunk.length;
    }
    return concated;
  }
}
