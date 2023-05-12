import { Splitable } from "async-iterable-split";

// 测试数据总大小是块大小的整数倍的场景，这种情况下根据大小拆分区块，块的数量必然是（总大小 / 块大小）
export async function integerMultiple() {
  let totalSize = 2 ** 30; // 1GB
  const chunkSize = 65536;
  let chunkCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (totalSize === 0) {
            return { done: true, value: undefined };
          }
          const randomSize = Math.min(totalSize, Math.floor(Math.random() * 16384));
          totalSize -= randomSize;
          return { done: false, value: new Uint8Array(randomSize) };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);
  const subIterable = splitable.splitSize(chunkSize);

  while (await splitable.hasValue) {
    let size = 0;
    for await (const item of subIterable) {
      size += item.length;
    }
    if (size !== chunkSize) {
      throw new Error("integerMultiple fail");
    }
    chunkCount++;
  }

  if (chunkCount !== 2 ** 30 / chunkSize) {
    throw new Error("integerMultiple fail");
  }
}

// 测试数据总大小不是块大小的整数倍的场景，最后应该会多出来一块
export async function notIntegerMultiple() {
  const chunkSize = 65536;
  let totalSize = 2 ** 30 + (1 + Math.floor(Math.random() * 65535)); // 1GB + 一个随机数 [1, 65535]
  let chunkCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (totalSize === 0) {
            return { done: true, value: undefined };
          }
          const randomSize = Math.min(totalSize, Math.floor(Math.random() * 16384));
          totalSize -= randomSize;
          return { done: false, value: new Uint8Array(randomSize) };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);
  const subIterable = splitable.splitSize(chunkSize);

  while (await splitable.hasValue) {
    for await (const item of subIterable) {
    }
    chunkCount++;
  }

  if (chunkCount !== 2 ** 30 / chunkSize + 1) {
    throw new Error("notIntegerMultiple fail");
  }
}
