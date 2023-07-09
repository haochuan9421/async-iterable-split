import { Splitable } from "async-iterable-split";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function helloworld() {
  const iterable = {
    [Symbol.asyncIterator]() {
      const haystack = ["he", "llo", " wor", "ld"].map((str) => encoder.encode(str));
      return {
        async next() {
          const chunk = haystack.shift();
          if (!chunk) {
            return { done: true, value: undefined };
          }
          return { done: false, value: chunk };
        },
      };
    },
  };

  {
    const needle = encoder.encode("o");
    const splitable = new Splitable(iterable);

    const expect = ["hell", " w", "rld"];
    const result = [];

    while (await splitable.hasValue()) {
      const subIterator = splitable.splitBeforeNeedle(needle);
      let str = "";
      for await (const item of subIterator) {
        str += decoder.decode(item, { stream: true });
      }
      result.push(str);
    }

    while (expect.length) {
      if (expect.pop() !== result.pop()) {
        throw new Error("helloworld fail");
      }
    }
    if (result.length) {
      throw new Error("helloworld fail");
    }
  }

  {
    const needle = encoder.encode("l");
    const splitable = new Splitable(iterable);

    const expect = ["he", "", "o wor", "d"];
    const result = [];

    while (await splitable.hasValue()) {
      const subIterator = splitable.splitBeforeNeedle(needle);
      let str = "";
      for await (const item of subIterator) {
        str += decoder.decode(item, { stream: true });
      }
      result.push(str);
    }

    while (expect.length) {
      if (expect.pop() !== result.pop()) {
        throw new Error("helloworld fail");
      }
    }
    if (result.length) {
      throw new Error("helloworld fail");
    }
  }

  {
    const needle = encoder.encode("world");
    const splitable = new Splitable(iterable);

    const expect = ["hello "];
    const result = [];

    while (await splitable.hasValue()) {
      const subIterator = splitable.splitBeforeNeedle(needle);
      let str = "";
      for await (const item of subIterator) {
        str += decoder.decode(item, { stream: true });
      }
      result.push(str);
    }

    while (expect.length) {
      if (expect.pop() !== result.pop()) {
        throw new Error("helloworld fail");
      }
    }
    if (result.length) {
      throw new Error("helloworld fail");
    }
  }
}

export async function needleNotAtTail() {
  const needle = new Uint8Array(32);
  for (let i = 0; i < needle.length; i++) {
    needle[i] = Math.floor(Math.random() * 128);
  }

  let needleCount = 0;

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
            // index 只可能是区间 [0, 16351] 中的整数，needle 的尾部顶多落在了 16382，16383 的位置一定是 0，也即 needle 一定不在尾部
            const index = Math.floor(num * 163520);
            chunk.set(needle, index);
            needleCount++;
          }

          return { done: false, value: chunk };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);

  let chunkCount = 0;

  while (await splitable.hasValue()) {
    const subIterator = splitable.splitBeforeNeedle(needle);
    for await (const item of subIterator) {
    }
    chunkCount++;
  }

  if (chunkCount - needleCount !== 1) {
    throw new Error("needleNotAtTail fail");
  }
}

export async function needleAtTail() {
  const needle = new Uint8Array(32);
  for (let i = 0; i < needle.length; i++) {
    needle[i] = Math.floor(Math.random() * 128);
  }

  let needleCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (++i > 65536) {
            return { done: true, value: undefined };
          }

          const chunk = new Uint8Array(16384);

          // 保证最后一个区块的尾部是 needle
          if (i === 65536) {
            chunk.set(needle, 16352);
            needleCount++;
          } else {
            const num = Math.random();
            if (num < 0.1) {
              const index = Math.floor(num * 163520);
              chunk.set(needle, index);
              needleCount++;
            }
          }

          return { done: false, value: chunk };
        },
      };
    },
  };

  const splitable = new Splitable(iterable);

  let chunkCount = 0;

  while (await splitable.hasValue()) {
    const subIterator = splitable.splitBeforeNeedle(needle);
    for await (const item of subIterator) {
    }
    chunkCount++;
  }

  if (chunkCount !== needleCount) {
    throw new Error("needleAtTail fail");
  }
}
