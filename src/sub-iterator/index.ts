import { Spliter } from "../index.js";

export abstract class SubIterator implements AsyncIterator<Uint8Array, undefined> {
  abstract next(): Promise<IteratorResult<Uint8Array>>;
  return: Spliter["return"];
  throw: Spliter["throw"];

  done: boolean;
  spliter: Spliter;

  constructor(spliter: Spliter) {
    this.return = spliter.return.bind(spliter);
    this.throw = spliter.throw.bind(spliter);

    this.done = false;
    this.spliter = spliter;
  }

  end() {
    if (this.done) {
      return;
    }
    this.done = true;
    this.spliter.subIterator = undefined;
  }
}
