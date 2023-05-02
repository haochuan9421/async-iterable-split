# async-iterable-split

<p>
    <a href="https://www.npmjs.com/package/async-iterable-split" target="_blank"><img src="https://img.shields.io/npm/v/async-iterable-split.svg?style=for-the-badge" alt="version"></a>
    <a href="https://npmcharts.com/compare/async-iterable-split" target="_blank"><img src="https://img.shields.io/npm/dm/async-iterable-split.svg?style=for-the-badge" alt="downloads"></a>
    <a href="https://github.com/haochuan9421/async-iterable-split/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/async-iterable-split.svg?style=for-the-badge" alt="license"></a>
    <a href="https://node.green/#ES2018" target="_blank"><img src="https://img.shields.io/node/v/async-iterable-split.svg?style=for-the-badge" alt="node-current"></a>
</p>

[English](#installation) [中文文档](#安装)

---

> Split an [async iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_async_iterator_and_async_iterable_protocols) (value is Uint8Array) into multiple sub async iterables by line, size or needle.

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

const iterable = createReadStream("./foo.txt"); // Node.js readable stream is async iterable object (since v10.0.0)
const spliter = new Spliter(iterable); // As long as the object has [Symbol.asyncIterator] interface, it can be used as a parameter for instantiating Spliter
const line = spliter.splitByLine(); // Create a sub async iterable object, the data of each round iteration is a row in the original data

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of line) {
    chunks.push(chunk);
  }
  // When the "for await of" loop exits, all the data of a row will be iterated out
  console.dir(Buffer.concat(chunks).toString());
}
```

The output looks like this:

```
'this is the first line'
'hello world'
'this is the last line'
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

const iterable = createReadStream("./foo.txt");
const spliter = new Spliter(iterable);
const fixedSize = spliter.splitBySize(10); // Create a sub async iterable object, the data of each round iteration is 10 bytes in the original data

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of fixedSize) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString());
}
```

The output looks like this:

```
'abcdefghij'
'klmnopqrst'
'uvwxyz'
```

### 3. Split by `needle`

Suppose we have a `foo.txt` file with the following contents:

```txt
foobarbaz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const iterable = createReadStream("./foo.txt");
const spliter = new Spliter(iterable);
const needle = Buffer.from("ba");
const endAtNeedle = spliter.splitByNeedle(needle); // Create a sub async iterable object, the data of each round iteration is the part before "ba" in the original data

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of endAtNeedle) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString());
}
```

The output looks like this:

```
'foo'
'r'
'z'
```

### 4. Cross-use

The above three splitting methods can be used independently or cross-used. Suppose we have an HTTP request message, and the content of the message is as follows:

```txt
POST / HTTP/1.1
Host: 127.0.0.1
Content-Length: 6

👋hi
```

```js
import { createServer } from "node:net";
import { Spliter } from "async-iterable-split";

const tcpServer = createServer(async (socket) => {
  const spliter = new Spliter(socket); // socket is async iterable object
  const line = spliter.splitByLine();

  // parse request line
  const lineChunks = [];
  for await (const chunk of line) {
    lineChunks.push(chunk);
  }
  const reqLine = Buffer.concat(lineChunks).toString("ascii");
  const [method, uri, version] = reqLine.split(" ");
  console.dir(method);
  console.dir(uri);
  console.dir(version);

  // parse request headers
  const headers = {};
  while (await spliter.hasValue) {
    const headerChunks = [];
    for await (const chunk of line) {
      headerChunks.push(chunk);
    }
    const header = Buffer.concat(headerChunks).toString("ascii");
    // If a blank line is encountered, it means the end of the request headers, jump out of the while loop
    if (header.length === 0) {
      break;
    }
    const [key, value] = header.split(":");
    headers[key.toLowerCase()] = value.trim();
  }
  console.dir(headers);

  // read request body
  const bodySize = Number(headers["content-length"]) || 0;
  const body = spliter.splitBySize(bodySize);
  const bodyChunks = [];
  for await (const chunk of body) {
    bodyChunks.push(chunk);
  }
  console.dir(Buffer.concat(bodyChunks).toString("utf-8"));
}).listen(8888);
```

> This is just a simple HTTP message parsing example, an HTTP parser that can be used in production should consider more.

The output looks like this:

```
'POST'
'/'
'HTTP/1.1'
{ host: '127.0.0.1', 'content-length': '6' }
'👋hi'
```

## Cautions

1. Sub async iterables can be created at the same time, can be used multiple times, and can be cross-used, but they cannot be iterated at the same time.
2. `spliter.hasValue` is a `getter` that returns a `Promise` instance. If it `resolve` the `true`, it means that the original async iterable still has data, otherwise it means that there is no data，in this case, iterating over sub async iterables is meaningless, note that sub async iterables cannot be iterated when `spliter.hasValue` is pending.

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
const spliter = new Spliter(iterable); // 只要是部署了 [Symbol.asyncIterator] 接口的对象，就可以作为实例化 Spliter 的参数
const line = spliter.splitByLine(); // 创建一个子异步可迭代对象，该对象每轮迭代出的数据是原始数据中的一行

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of line) {
    chunks.push(chunk);
  }
  // 当 for await of 循环退出时，一行的数据就全部迭代出来了
  console.dir(Buffer.concat(chunks).toString());
}
```

输出如下所示：

```
'this is the first line'
'hello world'
'this is the last line'
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

const iterable = createReadStream("./foo.txt");
const spliter = new Spliter(iterable);
const fixedSize = spliter.splitBySize(10); // 创建一个子异步可迭代对象，该对象每轮迭代出的数据是原始数据中的 10 个字节

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of fixedSize) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString());
}
```

输出如下所示：

```
'abcdefghij'
'klmnopqrst'
'uvwxyz'
```

### 3. 按 `needle` 拆分

假设我们有一个 `foo.txt` 文件，文件内容如下所示：

```txt
foobarbaz
```

```js
import { createReadStream } from "node:fs";
import { Spliter } from "async-iterable-split";

const iterable = createReadStream("./foo.txt");
const spliter = new Spliter(iterable);
const needle = Buffer.from("ba");
const endAtNeedle = spliter.splitByNeedle(needle); // 创建一个子异步可迭代对象，该对象每轮迭代出的数据是原始数据中 "ba" 前面的部分

while (await spliter.hasValue) {
  const chunks = [];
  for await (const chunk of endAtNeedle) {
    chunks.push(chunk);
  }
  console.dir(Buffer.concat(chunks).toString());
}
```

输出如下所示：

```
'foo'
'r'
'z'
```

### 4. 交叉使用

以上三种拆分方式即可以独立使用，也可以交叉使用，假设我们有一个 HTTP 请求消息，消息内容如下所示：

```txt
POST / HTTP/1.1
Host: 127.0.0.1
Content-Length: 6

👋hi
```

```js
import { createServer } from "node:net";
import { Spliter } from "async-iterable-split";

const tcpServer = createServer(async (socket) => {
  const spliter = new Spliter(socket); // socket 是异步可迭代对象
  const line = spliter.splitByLine();

  // 解析请求行
  const lineChunks = [];
  for await (const chunk of line) {
    lineChunks.push(chunk);
  }
  const reqLine = Buffer.concat(lineChunks).toString("ascii");
  const [method, uri, version] = reqLine.split(" ");
  console.dir(method);
  console.dir(uri);
  console.dir(version);

  // 解析请求头
  const headers = {};
  while (await spliter.hasValue) {
    const headerChunks = [];
    for await (const chunk of line) {
      headerChunks.push(chunk);
    }
    const header = Buffer.concat(headerChunks).toString("ascii");
    // 如果遇到了空行代表请求头部分结束了，跳出 while 循环
    if (header.length === 0) {
      break;
    }
    const [key, value] = header.split(":");
    headers[key.toLowerCase()] = value.trim();
  }
  console.dir(headers);

  // 读取请求体
  const bodySize = Number(headers["content-length"]) || 0;
  const body = spliter.splitBySize(bodySize);
  const bodyChunks = [];
  for await (const chunk of body) {
    bodyChunks.push(chunk);
  }
  console.dir(Buffer.concat(bodyChunks).toString("utf-8"));
}).listen(8888);
```

> 这只是一个简单的 HTTP 消息解析示例，一个可同于生成环境的 HTTP 消息解析器需要考虑更多。

输出如下所示：

```
'POST'
'/'
'HTTP/1.1'
{ host: '127.0.0.1', 'content-length': '6' }
'👋hi'
```

## 注意事项

1. “子异步可迭代对象”可同时创建，可多次使用，可交叉使用，但不可同时迭代。
2. `spliter.hasValue` 是一个 `getter`，会返回 `Promise` 实例，如果该 `Promise` `resolve` 了 `true`，则代表原始可迭代对象还有数据，反之则代表没有数据了，此时迭代子异步可迭代对象是没有意义的，注意 `spliter.hasValue` 正在进行中的时候是不可以迭代“子异步可迭代对象”的。
