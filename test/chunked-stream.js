import { concat, Splitable } from "async-iterable-split";

export async function chunkedStream() {
  const chunks = ["foo ", "bar\r\n", "baz\n", "😊", "", "中文", "x".repeat(0xffff), "y".repeat(0xf0f0), "z".repeat(0x0f0f)];

  const iterable = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i > chunks.length) {
            return { done: true, value: undefined };
          }
          if (i === chunks.length) {
            i++;
            return { done: false, value: new Uint8Array(4) /* 终止区块 */ };
          }
          const chunk = chunks[i++];
          const data = new TextEncoder().encode(chunk);
          if (data.length) {
            const dv = new DataView(new ArrayBuffer(4));
            dv.setUint32(0, data.length, false);
            const size = new Uint8Array(dv.buffer);
            return { done: false, value: concat([size, data]) };
          }
          return this.next();
        },
      };
    },
  };

  const splitable = new Splitable(iterable);
  const subIterator = splitable.splitChunkedStream();

  let decoded = "";
  const decoder = new TextDecoder();
  for await (const chunk of subIterator) {
    decoded += decoder.decode(chunk, { stream: true });
  }

  if (decoded !== chunks.join("")) {
    throw new Error("chunkedStream fail");
  }
}
