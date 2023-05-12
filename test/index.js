import { lineBreakAtTail, lineBreakNotAtTail } from "./line.js";
import { integerMultiple, notIntegerMultiple } from "./size.js";
import { helloworld, needleNotAtTail, needleAtTail } from "./needle.js";
import { chunkedStream } from "./chunked-stream.js";
import { chunkedHTTPBody } from "./chunked-http-body.js";

console.time("lineBreakAtTail");
await lineBreakAtTail();
console.timeEnd("lineBreakAtTail");

console.time("lineBreakNotAtTail");
await lineBreakNotAtTail();
console.timeEnd("lineBreakNotAtTail");

console.time("integerMultiple");
await integerMultiple();
console.timeEnd("integerMultiple");

console.time("notIntegerMultiple");
await notIntegerMultiple();
console.timeEnd("notIntegerMultiple");

console.time("helloworld");
await helloworld();
console.timeEnd("helloworld");

console.time("needleNotAtTail");
await needleNotAtTail();
console.timeEnd("needleNotAtTail");

console.time("needleAtTail");
await needleAtTail();
console.timeEnd("needleAtTail");

console.time("chunkedStream");
await chunkedStream();
console.timeEnd("chunkedStream");

console.time("chunkedHTTPBody");
await chunkedHTTPBody();
console.timeEnd("chunkedHTTPBody");
