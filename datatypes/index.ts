import { Data } from "npm:@lucid-evolution/lucid";

/*
  Some sources used: 
    https://github.com/leobel/janus-wallet/blob/bdc66afe2e1bc2f13ee4873c5c03232d5e02327c/src/contract-types.ts
*/

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
export const IntervalBoundTypeSchema = Data.Enum([
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


const HashBlake2b224Schema = Data.Bytes({ minLength: 28, maxLength: 28 });
const HashBlake2b256Schema = Data.Bytes({ minLength: 32, maxLength: 32 });

const CredentialSchema = Data.Enum([
    Data.Object({ VerificationKey: Data.Tuple([HashBlake2b224Schema]) }),
    Data.Object({ Script: Data.Tuple([HashBlake2b224Schema]) }),
]);

export type Credential = Data.Static<typeof CredentialSchema>;
export const Credential = CredentialSchema as unknown as Credential;

const PointerSchema = Data.Object({
    slot_number: Data.Integer(),
    transaction_index: Data.Integer(),
    certificate_index: Data.Integer()
});


const StakeCredentialSchema = Data.Enum([
    Data.Object({ Inline: Data.Tuple([CredentialSchema], { hasConstr: true }) }),
    Data.Object({ Pointer: Data.Tuple([PointerSchema], { hasConstr: true }) })
])
export type StakeCredential = Data.Static<typeof StakeCredentialSchema>;
export const StakeCredential = StakeCredentialSchema as unknown as StakeCredential;


const AddressSchema = Data.Object({
    payment_credential: CredentialSchema,
    stake_credential: Data.Nullable(StakeCredentialSchema),
});
export type Address = Data.Static<typeof AddressSchema>;
export const Address = AddressSchema as unknown as Address;

const DatumSchema = Data.Enum([
    Data.Object({ NoDatum: Data.Literal("NoDatum") }),
    Data.Object({ DatumHash: Data.Tuple([HashBlake2b256Schema], { hasConstr: true }) }),
    Data.Object({ InlineDatum: Data.Tuple([Data.Any()], { hasConstr: true }) }),
]);
export type Datum = Data.Static<typeof DatumSchema>;
export const Datum = DatumSchema as unknown as Datum;

const OutputReferenceSchema = Data.Object({
    transaction_id: HashBlake2b256Schema,
    output_index: Data.Integer()
});
export type OutputReference = Data.Static<typeof OutputReferenceSchema>;
export const OutputReference = OutputReferenceSchema as unknown as OutputReference;


const OutputSchema = Data.Object({
    address: AddressSchema,
    value: ValueSchema,
    datum: DatumSchema,
    reference_script: Data.Nullable(HashBlake2b224Schema)
});
export type Output = Data.Static<typeof OutputSchema>;
export const Output = OutputSchema as unknown as OutputReference;

export const InputSchema = Data.Object({
  output_reference: OutputReferenceSchema,
  output: OutputSchema,
});

export type Input = Data.Static<typeof InputSchema>;
export const Input = InputSchema as unknown as Input;

const ReferenceInputsSchema = Data.Array(InputSchema);
export type ReferenceInputs = Data.Static<typeof ReferenceInputsSchema>;
export const ReferenceInputs = ReferenceInputsSchema as unknown as ReferenceInputs;
