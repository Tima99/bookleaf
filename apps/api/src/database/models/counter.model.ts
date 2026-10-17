import { Schema, model } from 'mongoose';

/** Atomic sequences (e.g. human-friendly ticket numbers BL-1001, BL-1002…). */
interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<CounterDoc>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true },
});

export const CounterModel = model<CounterDoc>('Counter', counterSchema);

const SEQUENCE_START = 1000;

/**
 * Returns the next value of a sequence. The first statement is an idempotent
 * initialisation; the `$inc` is atomic, so concurrent callers never share a number.
 */
export async function nextSequence(name: string): Promise<number> {
  try {
    await CounterModel.updateOne(
      { _id: name },
      { $setOnInsert: { seq: SEQUENCE_START } },
      { upsert: true },
    );
  } catch (err) {
    // Two concurrent first-time upserts: the loser gets E11000 and the counter exists.
    if (!(typeof err === 'object' && err !== null && 'code' in err && err.code === 11000))
      throw err;
  }
  const doc = await CounterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) throw new Error(`Failed to allocate sequence ${name}`);
  return doc.seq;
}
