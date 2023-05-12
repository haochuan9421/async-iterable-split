import { Splitable } from "../index.js";

export abstract class SubIterator implements AsyncIterator<Uint8Array, undefined> {
  abstract next(): Promise<IteratorResult<Uint8Array>>;
  return: Splitable["return"];
  throw: Splitable["throw"];

  done: boolean;
  splitable: Splitable;

  constructor(splitable: Splitable) {
    this.return = splitable.return.bind(splitable);
    this.throw = splitable.throw.bind(splitable);

    this.done = false;
    this.splitable = splitable;
    this.splitable.subIterators.add(this);
  }

  end() {
    if (this.done) {
      return;
    }
    this.done = true;
    this.splitable.subIterators.delete(this);
  }
}
