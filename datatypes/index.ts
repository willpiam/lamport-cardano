import { Data } from "npm:@lucid-evolution/lucid@0.4.29";

/*
  Some sources used: 
    https://github.com/leobel/janus-wallet/blob/bdc66afe2e1bc2f13ee4873c5c03232d5e02327c/src/contract-types.ts
*/
export const HashBlake2b224Schema = Data.Bytes({ minLength: 28, maxLength: 28 });
const StakePoolIdSchema = HashBlake2b224Schema;

const PolicyIdSchema = Data.Bytes({ minLength: 0, maxLength: 28 });;
export type PolicyId = Data.Static<typeof PolicyIdSchema>;
export const PolicyId = PolicyIdSchema as unknown as PolicyId;

const AssetNameSchema = Data.Bytes({ minLength: 0, maxLength: 32 });
export type AssetName = Data.Static<typeof AssetNameSchema>;
export const AssetName = AssetNameSchema as unknown as AssetName;

export const ValueSchema = Data.Map(
  PolicyIdSchema,
  Data.Map(
    AssetNameSchema,
    Data.Integer(),
    // {
    //   minItems: 1,
    //   maxItems: 1
    // }
  ),
  // {
  //   minItems: 1,
  //   maxItems: 1
  // }
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


const HashBlake2b256Schema = Data.Bytes({ minLength: 32, maxLength: 32 });

export const CredentialSchema = Data.Enum([
    Data.Object({ VerificationKey: Data.Tuple([HashBlake2b224Schema]) }),
    Data.Object({ Script: Data.Tuple([HashBlake2b224Schema]) }),
]);

export type Credential = Data.Static<typeof CredentialSchema>;
export const Credential = CredentialSchema as unknown as Credential;



const ListExtraSignatoriesSchema = Data.Array(HashBlake2b224Schema)
export type ListExtraSignatories = Data.Static<typeof ListExtraSignatoriesSchema>
export const ListExtraSignatories = ListExtraSignatoriesSchema as unknown as ListExtraSignatories

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

const OutputReferenceListSchema = Data.Array(OutputReferenceSchema)
export type OutputReferenceList = Data.Static<typeof OutputReferenceListSchema>
export const OutputReferenceList = OutputReferenceListSchema as unknown as OutputReferenceList

const OutputSchema = Data.Object({
    address: AddressSchema,
    value: ValueSchema,
    datum: DatumSchema,
    reference_script: Data.Nullable(HashBlake2b224Schema)
});
export type Output = Data.Static<typeof OutputSchema>;
export const Output = OutputSchema as unknown as Output;

const OutputListSchema = Data.Array(OutputSchema)
export type OutputList = Data.Static<typeof OutputListSchema>
export const OutputList = OutputListSchema as unknown as OutputList

export const InputSchema = Data.Object({
  output_reference: OutputReferenceSchema,
  output: OutputSchema,
});

export type Input = Data.Static<typeof InputSchema>;
export const Input = InputSchema as unknown as Input;

const ReferenceInputsSchema = Data.Array(InputSchema);
export type ReferenceInputs = Data.Static<typeof ReferenceInputsSchema>;
export const ReferenceInputs = ReferenceInputsSchema as unknown as ReferenceInputs;

const NeverSchema = Data.Nullable(Data.Integer()); // always instantiate to null

const DelegateRepresentativeSchema = Data.Enum([
    Data.Object({ Registered: CredentialSchema }),
    Data.Object({ AlwaysAbstain: Data.Literal("AlwaysAbstain") }),
    Data.Object({ AlwaysNoConfidence: Data.Literal("AlwaysNoConfidence") }),
]);

const DelegateVoteSchema = Data.Object({
    delegate_representative: DelegateRepresentativeSchema,
});
const DelegateBothSchema = Data.Object({
    stake_pool: StakePoolIdSchema,
    delegate_representative: DelegateRepresentativeSchema
});

const DelegateBlockProductionSchema = Data.Object({
    stake_pool: StakePoolIdSchema,
});

const DelegateSchema = Data.Enum([
    Data.Object({ DelegateBlockProduction: DelegateBlockProductionSchema }),
    Data.Object({ DelegateVote: DelegateVoteSchema }),
    Data.Object({ DelegateBoth: DelegateBothSchema }),
]);

const RegisterCredentialSchema = Data.Object({
    credential: CredentialSchema,
    deposit: NeverSchema
});
const UnRegisterCredentialSchema = Data.Object({
    credential: CredentialSchema,
    refund: NeverSchema
});
const DelegateCredentialSchema = Data.Object({
    credential: CredentialSchema,
    delegate: DelegateSchema
});

const RegisterAndDelegateCredentialSchema = Data.Object({
    credential: CredentialSchema,
    delegate: DelegateSchema,
    deposit: Data.Integer(),
});
const RegisterDelegateRepresentativeSchema = Data.Object({
    delegate_representative: CredentialSchema,
    deposit: Data.Integer(),
});
const UpdateDelegateRepresentativeSchema = Data.Object({
    delegate_representative: CredentialSchema,
});
const UnregisterDelegateRepresentativeSchema = Data.Object({
    delegate_representative: CredentialSchema,
    refund: Data.Integer(),
});
const RegisterStakePoolSchema = Data.Object({
    stake_pool: StakePoolIdSchema,
    vrf: HashBlake2b224Schema
});
const RetireStakePoolSchema = Data.Object({
    stake_pool: StakePoolIdSchema,
    at_epoch: Data.Integer()
});
const AuthorizeConstitutionalCommitteeProxySchema = Data.Object({
    constitutional_committee_member: CredentialSchema,
    proxy: CredentialSchema,
});
const RetireFromConstitutionalCommitteeSchema = Data.Object({
    constitutional_committee_member: CredentialSchema
})

const CertificateSchema = Data.Enum([
    Data.Object({ RegisterCredential: RegisterCredentialSchema }),
    Data.Object({ UnRegisterCredential: UnRegisterCredentialSchema }),
    Data.Object({ DelegateCredential: DelegateCredentialSchema }),
    Data.Object({ RegisterAndDelegateCredential: RegisterAndDelegateCredentialSchema }),
    Data.Object({ RegisterDelegateRepresentative: RegisterDelegateRepresentativeSchema }),
    Data.Object({ UpdateDelegateRepresentative: UpdateDelegateRepresentativeSchema }),
    Data.Object({ UnregisterDelegateRepresentative: UnregisterDelegateRepresentativeSchema }),
    Data.Object({ RegisterStakePool: RegisterStakePoolSchema }),
    Data.Object({ RetireStakePool: RetireStakePoolSchema }),
    Data.Object({ AuthorizeConstitutionalCommitteeProxy: AuthorizeConstitutionalCommitteeProxySchema }),
    Data.Object({ RetireFromConstitutionalCommittee: RetireFromConstitutionalCommitteeSchema }),
]);
export type Certificate = Data.Static<typeof CertificateSchema>;
export const Certificate = CertificateSchema as unknown as Certificate;

const CertificatesSchema = Data.Array(CertificateSchema)
export type Certificates = Data.Static<typeof CertificatesSchema>
export const Certificates = CertificatesSchema as unknown as Certificates

// const WithdrawalSchema = Data.