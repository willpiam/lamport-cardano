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

// aiken: ValidityRange = Interval<Int>
// aiken: Interval<a> = Interval { lower_bound: IntervalBound<a>, upper_bound: IntervalBound<a> }
// aiken: IntervalBound<a> = IntervalBound { bound_type: IntervalBoundType<a>, is_inclusive: Bool }
// aiken: IntervalBoundType<a> = One of NegativeInfinity, Finite(a), PositiveInfinity
const IntervalBoundTypeSchema = Data.Enum([
  Data.Object({ NegativeInfinity: Data.Literal("NegativeInfinity") }),
  Data.Object({ Finite: Data.Object({ value: Data.Integer() }) }),
  Data.Object({ PositiveInfinity: Data.Literal("PositiveInfinity") }),
]);
// credit: https://github.com/SundaeSwap-finance/sundae-contracts/blob/be33466b7dbe0f8e6c0e0f46ff23737897f45835/lucid/types.ts#L170
export const ValidityRangeSchema = Data.Object({
  lower_bound: Data.Object({
    bound_type: IntervalBoundTypeSchema,
    is_inclusive: Data.Boolean(),
  }),
  upper_bound: Data.Object({
    bound_type: IntervalBoundTypeSchema,
    is_inclusive: Data.Boolean(),
  }),
});
export type ValidityRange = Data.Static<typeof ValidityRangeSchema>;
export const ValidityRange = ValidityRangeSchema as unknown as ValidityRange;
