import { Data } from "npm:@lucid-evolution/lucid";

export const ValueSchema = Data.Map(
  Data.Bytes(),
  Data.Map(
    Data.Bytes(),
    Data.Integer(),
  ),
);
export type Value = Data.Static<typeof ValueSchema>;
export const Value = ValueSchema as unknown as Value;
