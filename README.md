# async-iterable-split

<p>
    <a href="https://www.npmjs.com/package/async-iterable-split" target="_blank"><img src="https://img.shields.io/npm/v/async-iterable-split.svg?style=for-the-badge" alt="version"></a>
    <a href="https://npmcharts.com/compare/async-iterable-split" target="_blank"><img src="https://img.shields.io/npm/dm/async-iterable-split.svg?style=for-the-badge" alt="downloads"></a>
    <a href="https://github.com/haochuan9421/async-iterable-split/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/async-iterable-split.svg?style=for-the-badge" alt="license"></a>
    <a href="https://node.green/#ES2018" target="_blank"><img src="https://img.shields.io/node/v/async-iterable-split.svg?style=for-the-badge" alt="node-current"></a>
</p>

[English](#installation) [中文文档](#安装)

---

> Split an [async iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) (value is Uint8Array) into multiple "sub async iterable"s by line, size or needle.

## Installation

```bash
npm i async-iterable-split
```

## Quick Start

### 1. Split by line

Suppose we have a `foo.txt` file with the following contents:

```txt
this is the first line
hello world
this is the last line
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const iterable = createReadStream("./foo.txt"); // Node.js readable stream is async iterable (since v10.0.0)
const spliter = new Spliter(iterable); // Any object that deploys the [Symbol.asyncIterator] interface can be used as a parameter for instantiating Spliter
const subIterable = spliter.splitByLine(); // Create a "sub async iterable", all the data iterated from this object in each round is a row of the original

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  // When the "for await of" loop exits, all the data of a row will be iterated out
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

The output looks like this:

```
'this is the first line'
'hello world'
'this is the last line'
```

You can also use the `readLine` method to get a whole line at once:

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const line = await spliter.readLine(); // Type of "line" is Uint8Array
  console.dir(Buffer.from(line).toString("utf-8"));
}
```

> Line break can be either `LF` or `CRLF`.

### 2. Split by size

Suppose we have a `foo.txt` file with the following contents:

```txt
abcdefghijklmnopqrstuvwxyz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
const subIterable = spliter.splitBySize(10); // Create a "sub async iterable", all the data iterated from this object in each round is 10 bytes data of the original

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

The output looks like this:

```
'abcdefghij'
'klmnopqrst'
'uvwxyz'
```

You can also use the `readSize` method to get fixed-size data at once:

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const part = await spliter.readSize(10);
  console.dir(Buffer.from(part).toString("utf-8"));
}
```

### 3. Split by `needle`

Suppose we have a `foo.txt` file with the following contents:

```txt
foobarbaz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
const subIterable = spliter.splitByNeedle(Buffer.from("ba")); // Create a "sub async iterable", all the data iterated from this object in each round is data before "ba" of the original

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

The output looks like this:

```
'foo'
'r'
'z'
```

You can also use the `readBeforeNeedle` method to get all the data before `needle` at once:

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const part = await spliter.readBeforeNeedle(Buffer.from("ba"));
  console.dir(Buffer.from(part).toString("utf-8"));
}
```

### 4. Cross-use

The above three splitting way can be used alone or cross-used. The following is an example of parsing an HTTP request message, there are parts split by line and parts split by size:

**Server**:

```js
import { createServer } from "node:net";
import { Spliter } from "async-iterable-split";

const server = createServer((socket) => {
  (async () => {
    // Node.js socket is also async iterable
    const spliter = new Spliter(socket);
    while (await spliter.hasValue) {
      // httpReqParser will parses one HTTP request message at a time, one TCP connection may contain multiple HTTP messages
      console.log(await httpReqParser(spliter));
    }
  })().catch((error) => {
    console.log("got error", error);
    socket.destroy(error);
  });
}).listen(8888, "127.0.0.1", () => {
  console.log(server.address());
});

// This is just a simple HTTP request message parser, a production-ready parser needs more consideration.
async function httpReqParser(spliter) {
  const reqMsg = {};

  // Parse the request line, limiting the request line size to 65535 bytes
  const reqLine = Buffer.from(await spliter.readLine(65536)).toString("ascii");
  const reqInfos = reqLine.split(" ");
  reqMsg.method = reqInfos.shift();
  reqMsg.uri = reqInfos.shift();
  reqMsg.httpVersion = reqInfos.shift().replace("HTTP/", "");

  // Parse the request headers, limit the size of a single request header to 16384 bytes, and limit the count of request headers to 256
  reqMsg.headers = {};
  let headerCount = 0;
  while (await spliter.hasValue) {
    if (headerCount > 256) {
      throw new Error("header count exceeded limit");
    }
    const header = Buffer.from(await spliter.readLine(16384)).toString("ascii");
    // If a blank line is encountered, it means the end of the request headers, jump out of the while loop
    if (header.length === 0) {
      break;
    }
    headerCount++;
    const [key, value] = header.split(":");
    reqMsg.headers[key.toLowerCase()] = value.trim();
  }

  // Parse the request body and limit the size of the request body to 1MB
  const bodySize = Number(reqMsg.headers["content-length"]) || 0;
  if (bodySize > 2 ** 20) {
    throw new Error("body size exceeded limit");
  }
  reqMsg.body = Buffer.from(await spliter.readSize(bodySize)).toString("utf-8");

  // return parsing result
  return reqMsg;
}
```

**Client**:

```js
import { connect } from "node:net";

// Establish a TCP connection, and after successful establishment, send two consecutive HTTP request messages
const socket = connect({ host: "127.0.0.1", port: 8888 }, () => {
  socket.write(`GET / HTTP/1.1
Host: 127.0.0.1

`);

  socket.write(`POST /ping HTTP/1.1
Host: 127.0.0.1
Content-Type: text/plain; charset=utf-8
Content-Length: 8

👋ping`);
});
```

The server output looks like this:

```
{
  method: 'GET',
  uri: '/',
  httpVersion: '1.1',
  headers: { host: '127.0.0.1' },
  body: ''
}
{
  method: 'POST',
  uri: '/ping',
  httpVersion: '1.1',
  headers: {
    host: '127.0.0.1',
    'content-type': 'text/plain; charset=utf-8',
    'content-length': '8'
  },
  body: '👋ping'
}
```

## Cautions

1. The "sub async iterable" created by `splitByLine`, `splitBySize` or `splitByNeedle` methods cannot be iterated at the same time. You must wait for the previous round of iteration to end before starting a new round of iteration. The same "sub async iterable" can be used repeatedly, but the data obtained in each round of iteration is not the same part of the original, but a different part with the same characteristics.

2. When calling `readLine`, `readSize` or `readBeforeNeedle` methods, the corresponding "sub async iterable" will be automatically created and iterated immediately. The iterated data will be temporarily stored in memory. When the iteration ends, All data chunks will be concated into one data chunk and `resolve` out. It is recommended to set a reasonable size limit to avoid memory leaks.

3. `spliter.hasValue` is a `getter`, the value is a `Promise` instance, if it `resolve` the `true`, it means that the original iterable still has data, otherwise it means that there is no data. The value cannot be retrieved again while it is in `pending` state, or a "sub async iterable" is iterating.

---

> 将一个“[异步可迭代对象](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols)”（值为 Uint8Array）按行、大小或 `needle` 拆分成多个“子异步可迭代对象”。

## 安装

```bash
npm i async-iterable-split
```

## 快速开始

### 1. 按行拆分

假设我们有一个 `foo.txt` 文件，文件内容如下所示：

```txt
this is the first line
hello world
this is the last line
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const iterable = createReadStream("./foo.txt"); // Node.js 的可读流是异步可迭代对象（从 v10.0.0 开始）
const spliter = new Spliter(iterable); // 任何部署了 [Symbol.asyncIterator] 接口的对象，都可以作为实例化 Spliter 的参数
const subIterable = spliter.splitByLine(); // 创建一个“子异步可迭代对象”，该对象每轮迭代出的全部数据是原始数据中的一行

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  // 当 for await of 循环退出时，一行的数据就全部迭代出来了
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

输出如下所示：

```
'this is the first line'
'hello world'
'this is the last line'
```

也可以使用 `readLine` 方法一次性获取一整行的数据：

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const line = await spliter.readLine(); // "line" 的类型是 Uint8Array
  console.dir(Buffer.from(line).toString("utf-8"));
}
```

> 换行符可以是 `LF` 也可以是 `CRLF`。

### 2. 按大小拆分

假设我们有一个 `foo.txt` 文件，文件内容如下所示：

```txt
abcdefghijklmnopqrstuvwxyz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
const subIterable = spliter.splitBySize(10); // 创建一个子异步可迭代对象，该对象每轮迭代出的全部数据是原始数据中的 10 个字节

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

输出如下所示：

```
'abcdefghij'
'klmnopqrst'
'uvwxyz'
```

也可以使用 `readSize` 方法一次性获取固定大小的数据：

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const part = await spliter.readSize(10);
  console.dir(Buffer.from(part).toString("utf-8"));
}
```

### 3. 按 `needle` 拆分

假设我们有一个 `foo.txt` 文件，文件内容如下所示：

```txt
foobarbaz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
const subIterable = spliter.splitByNeedle(Buffer.from("ba")); // 创建一个子异步可迭代对象，该对象每轮迭代出的数据是原始数据中 "ba" 前面的部分

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of subIterable) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString("utf-8"));
}
```

输出如下所示：

```
'foo'
'r'
'z'
```

也可以使用 `readBeforeNeedle` 方法一次性获取 `needle` 前面的所有数据：

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const spliter = new Spliter(createReadStream("./foo.txt"));
while (await spliter.hasValue) {
  const part = await spliter.readBeforeNeedle(Buffer.from("ba"));
  console.dir(Buffer.from(part).toString("utf-8"));
}
```

### 4. 交叉使用

以上三种拆分方式即可以单独使用，也可以交叉使用，下面是一个解析 HTTP 请求报文的示例，即有按行拆分的部分，也有按大小拆分的部分：

**服务端**：

```js
import { createServer } from "node:net";
import { Spliter } from "async-iterable-split";

const server = createServer((socket) => {
  (async () => {
    // Node.js 中的 socket 也是异步可迭代对象
    const spliter = new Spliter(socket);
    while (await spliter.hasValue) {
      // httpReqParser 每次解析一个 HTTP 请求报文，一个 TCP 连接可能包含多个 HTTP 报文
      console.log(await httpReqParser(spliter));
    }
  })().catch((error) => {
    console.log("got error", error);
    socket.destroy(error);
  });
}).listen(8888, "127.0.0.1", () => {
  console.log(server.address());
});

// 这只是一个简单的 HTTP 请求报文解析器，一个可用于生产环境的解析器要考虑更多。
async function httpReqParser(spliter) {
  const reqMsg = {};

  // 解析请求行，将请求行大小限制在 65535 个字节以内
  const reqLine = Buffer.from(await spliter.readLine(65536)).toString("ascii");
  const reqInfos = reqLine.split(" ");
  reqMsg.method = reqInfos.shift();
  reqMsg.uri = reqInfos.shift();
  reqMsg.httpVersion = reqInfos.shift().replace("HTTP/", "");

  // 解析请求头，将单个请求头大小限制在 16384 个字节以内，请求头个数限制在 256 个以内
  reqMsg.headers = {};
  let headerCount = 0;
  while (await spliter.hasValue) {
    if (headerCount > 256) {
      throw new Error("header count exceeded limit");
    }
    const header = Buffer.from(await spliter.readLine(16384)).toString("ascii");
    // 如果遇到了空行代表请求头部分结束了，跳出 while 循环
    if (header.length === 0) {
      break;
    }
    headerCount++;
    const [key, value] = header.split(":");
    reqMsg.headers[key.toLowerCase()] = value.trim();
  }

  // 解析请求体，将请求体大小限制在 1MB 以内
  const bodySize = Number(reqMsg.headers["content-length"]) || 0;
  if (bodySize > 2 ** 20) {
    throw new Error("body size exceeded limit");
  }
  reqMsg.body = Buffer.from(await spliter.readSize(bodySize)).toString("utf-8");

  // 返回解析结果
  return reqMsg;
}
```

**客户端**：

```js
import { connect } from "node:net";

// 建立 TCP 连接，并在建立成功后，连续发送两条 HTTP 请求报文
const socket = connect({ host: "127.0.0.1", port: 8888 }, () => {
  socket.write(`GET / HTTP/1.1
Host: 127.0.0.1

`);

  socket.write(`POST /ping HTTP/1.1
Host: 127.0.0.1
Content-Type: text/plain; charset=utf-8
Content-Length: 8

👋ping`);
});
```

服务端的输出如下所示：

```
{
  method: 'GET',
  uri: '/',
  httpVersion: '1.1',
  headers: { host: '127.0.0.1' },
  body: ''
}
{
  method: 'POST',
  uri: '/ping',
  httpVersion: '1.1',
  headers: {
    host: '127.0.0.1',
    'content-type': 'text/plain; charset=utf-8',
    'content-length': '8'
  },
  body: '👋ping'
}
```

## 注意事项

1. 通过 `splitByLine`，`splitBySize` 或 `splitByNeedle` 方法创建的“子异步可迭代对象”不能被同时迭代，必须等前一轮迭代结束了，才能开启新的一轮迭代。同一个“子异步可迭代对象”可反复使用，但每轮迭代出的数据并不是原始数据中的同一个部分，而是具备同一个特性的不同部分。

2. 调用 `readLine`，`readSize` 或 `readBeforeNeedle` 方法时会自动创建对应的“子异步可迭代对象”并立即对其进行迭代，迭代出的数据会暂存在内存中，当迭代结束时，会将所有数据块合并成一个完整的数据块 `resolve` 出来。建议使用这些方法时设置一个合理的大小限制，避免内存泄漏。

3. `spliter.hasValue` 是一个 `getter`，值是 `Promise` 实例，如果它 `resolve` 了 `true`，则代表原始可迭代对象还有数据，反之则代表没有数据了。当它处于 `pending` 状态时不可再次获取该值，亦不可迭代“子异步可迭代对象”。
