import { Splitable } from "async-iterable-split";

// 测试换行符不在尾部的情况，这种情况下根据换行符拆分区块，区块的数量应该等于（换行符的数量 + 1），就像一刀下去一条绳子会被切成二段一样
export async function lineBreakNotAtTail() {
  let lineBreakCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (++i > 65536) {
            return { done: true, value: undefined };
          }

          const chunk = new Uint8Array(16384);

          // 随机添加 CRLF 或 LF 进去
          const num = Math.random();
          if (num < 0.1) {
            // index 只可能是区间 [0, 16382] 中的整数，16383 的位置一定是 0，也即换行符一定不在尾部
            const index = Math.floor(num * 163830);
            chunk[index] = 10;
            if (index % 2) {
              chunk[index - 1] = 13;
            }
            lineBreakCount++;
          }

          return { done: false, value: chunk };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);
  const subIterable = splitable.splitLine();

  let chunkCount = 0;

  while (await splitable.hasValue) {
    for await (const item of subIterable) {
    }
    chunkCount++;
  }

  if (chunkCount - lineBreakCount !== 1) {
    throw new Error("lineBreakNotAtTail fail");
  }
}

// 测试换行符在尾部的情况，区块的数量应该等于换行符的数量，因为最后一个换行符后面已经没有数据了，不会再生成区块了
export async function lineBreakAtTail() {
  let lineBreakCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (++i > 65536) {
            return { done: true, value: undefined };
          }

          const chunk = new Uint8Array(16384);

          const num = Math.random();
          if (num < 0.1) {
            const index = Math.floor(num * 163830);
            chunk[index] = 10;
            if (index % 2) {
              chunk[index - 1] = 13;
            }
            lineBreakCount++;
          }

          // 保证最后一个区块的尾部是 LF
          if (i === 65536) {
            lineBreakCount++;
            chunk[chunk.length - 1] = 10;
          }

          return { done: false, value: chunk };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);
  const subIterable = splitable.splitLine();

  let chunkCount = 0;

  while (await splitable.hasValue) {
    for await (const item of subIterable) {
    }
    chunkCount++;
  }

  if (chunkCount !== lineBreakCount) {
    throw new Error("lineBreakAtTail fail");
  }
}
