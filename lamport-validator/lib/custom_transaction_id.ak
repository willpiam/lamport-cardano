use cardano/transaction.{ValidityRange, Transaction }
use aiken/builtin
use aiken/crypto.{Hash, Sha2_256, sha2_256}
use cardano/assets.{Value, Lovelace}
use cardano/governance.{Voter, GovernanceActionId, Vote}
// use cardano/address.{Credential}
// use aiken/collection/dict.{Dict}
// use aiken/collection/list
use aiken/primitive/bytearray
// use helpers.{SpendAction}


// TODO: come up with a better name than Custom Transaction Id
// TODO: for each "with_" function make sure to avoid everything that would cause the circular-hash-input problem

// Transaction as defined in aiken docs
// Transaction {
//   inputs: List<Input>,
//   reference_inputs: List<Input>,
//   outputs: List<Output>,
//   fee: Lovelace,
//   mint: Value,
//   certificates: List<Certificate>,
//   withdrawals: Pairs<Credential, Lovelace>,
//   validity_range: ValidityRange,
//   extra_signatories: List<VerificationKeyHash>,
//   redeemers: Pairs<ScriptPurpose, Redeemer>,
//   datums: Dict<DataHash, Data>,
//   id: TransactionId,
//   votes: Pairs<Voter, Pairs<GovernanceActionId, Vote>>,
//   proposal_procedures: List<ProposalProcedure>,
//   current_treasury_amount: Option<Lovelace>,
//   treasury_donation: Option<Lovelace>,
// }

type CustomTransactionIdBuilder {
  inputs: Option<ByteArray>,
  reference_inputs: Option<ByteArray>,
  outputs: Option<ByteArray>,
  fee: Option<ByteArray>,
  mint: Option<ByteArray>,
  certificates: Option<ByteArray>,
  withdrawals: Option<ByteArray>,
  validity_range: Option<ByteArray>,
  extra_signatories: Option<ByteArray>,
  redeemers: Option<ByteArray>,
  datums: Option<ByteArray>,
  votes: Option<ByteArray>,
  proposal_procedures: Option<ByteArray>,
  current_treasury_amount: Option<ByteArray>,
  treasury_donation: Option<ByteArray>,
}

type CustomTransactionId = Hash<Sha2_256, ByteArray>

fn new_custom_transaction_id() -> CustomTransactionIdBuilder {
  CustomTransactionIdBuilder { 
    inputs: None, 
    reference_inputs: None,
    outputs: None,
    fee: None,
    mint: None,
    certificates: None,
    withdrawals: None,
    validity_range: None,
    extra_signatories: None,
    redeemers: None,
    datums: None,
    votes: None,
    proposal_procedures: None,
    current_treasury_amount: None,
    treasury_donation: None,
  }
}

// fn with_inputs(self: CustomTransactionIdBuilder, inputs: List<Input>) -> CustomTransactionIdBuilder {
//   let inputs_bytes = builtin.serialise_data(inputs)
//   CustomTransactionIdBuilder {
//     ..self,
//     inputs: Some(inputs_bytes),
//   }
// }

// fn with_reference_inputs(self: CustomTransactionIdBuilder, reference_inputs: List<Input>) -> CustomTransactionIdBuilder {
//   let reference_inputs_bytes = builtin.serialise_data(reference_inputs)

//   CustomTransactionIdBuilder {
//     ..self,
//     reference_inputs: Some(reference_inputs_bytes),
//   }
// }

// fn with_outputs(self: CustomTransactionIdBuilder, outputs: List<Output>) -> CustomTransactionIdBuilder {
//   let outputs_bytes = builtin.serialise_data(outputs)

//   CustomTransactionIdBuilder {
//     ..self,
//     outputs: Some(outputs_bytes),
//   }
// }

// fn with_fee(self: CustomTransactionIdBuilder, fee: Lovelace) -> CustomTransactionIdBuilder {
//   let fee_bytes = builtin.serialise_data(fee)

//   CustomTransactionIdBuilder {
//     ..self,
//     fee: Some(fee_bytes),
//   }
// }

fn with_mint(self: CustomTransactionIdBuilder, mint: Value) -> CustomTransactionIdBuilder {
  let mint_bytes = builtin.serialise_data(mint)

  CustomTransactionIdBuilder {
    ..self,
    mint: Some(mint_bytes),
  }
}

// fn with_certificates(self: CustomTransactionIdBuilder, certificates: List<Certificate>) -> CustomTransactionIdBuilder {
//   let certificates_bytes = builtin.serialise_data(certificates)

//   CustomTransactionIdBuilder {
//     ..self,
//     certificates: Some(certificates_bytes)
//   }
// }

// fn with_withdrawals(self: CustomTransactionIdBuilder, withdrawals : Pairs<Credential, Lovelace>) -> CustomTransactionIdBuilder {
//   let withdrawals_bytes = builtin.serialise_data(withdrawals)

//   CustomTransactionIdBuilder {
//     ..self,
//     withdrawals: Some(withdrawals_bytes)
//   }
// }

fn with_validity_range(self: CustomTransactionIdBuilder, validity_range: ValidityRange) -> CustomTransactionIdBuilder {
  trace @"inside with_validity_range": validity_range
  let validity_range_bytes = builtin.serialise_data(validity_range)
  trace @"validity_range_bytes is ": validity_range_bytes

  CustomTransactionIdBuilder {
    ..self,
    validity_range: Some(validity_range_bytes)
  }
}

// fn with_extra_signatories(self: CustomTransactionIdBuilder, extra_signatories: List<VerificationKeyHash>) -> CustomTransactionIdBuilder {
//   let extra_signatories_bytes = builtin.serialise_data(extra_signatories)

//   CustomTransactionIdBuilder {
//     ..self,
//     extra_signatories: Some(extra_signatories_bytes)
//   }
// }

// fn with_redeemers(self: CustomTransactionIdBuilder, redeemers: Pairs<ScriptPurpose, Redeemer>) -> CustomTransactionIdBuilder {
//   // find redeemers created with the VerifySignatureChunk and drop the signature chunk
//   let sanitized_redeemers = redeemers 
//     |> list.reduce(#[], fn (acc, redeemer_pair) -> ByteArray {
//       // expect Pair(purpose, redeemer) = redeemer_pair
//       let Pair(purpose, redeemer) = redeemer_pair
//       let redeemer_bytes = if redeemer is SpendAction {
//         when redeemer is {
//           SpendAction.VerifySignatureChunk(_) | SpendAction.VerifyFullSignature(_) -> builtin.serialise_data(Pair(purpose, #[0]))
//           _ -> builtin.serialise_data(redeemer_pair)
//         }
//       } else {
//         builtin.serialise_data(redeemer_pair)
//       }
//       bytearray.concat(acc, redeemer_bytes)
//     })

//   CustomTransactionIdBuilder {
//     ..self,
//     redeemers: Some(sanitized_redeemers)
//   }
// }

// fn with_datums(self: CustomTransactionIdBuilder, datums: Dict<DataHash, Data>) -> CustomTransactionIdBuilder {
//   let datums_bytes = builtin.serialise_data(datums)

//   CustomTransactionIdBuilder {
//     ..self,
//     datums: Some(datums_bytes)
//   }
// }

fn with_votes(self: CustomTransactionIdBuilder, votes: Pairs<Voter, Pairs<GovernanceActionId, Vote>>) -> CustomTransactionIdBuilder {
  let votes_bytes = builtin.serialise_data(votes)

  CustomTransactionIdBuilder {
    ..self,
    votes: Some(votes_bytes)
  }
}

// fn with_proposal_procedures(self: CustomTransactionIdBuilder, proposal_procedures: List<ProposalProcedure>) -> CustomTransactionIdBuilder {
//   let proposal_procedures_bytes = builtin.serialise_data(proposal_procedures)

//   CustomTransactionIdBuilder {
//     ..self,
//     proposal_procedures: Some(proposal_procedures_bytes)
//   }
// }

// fn with_current_treasury_amount(self: CustomTransactionIdBuilder, current_treasury_amount: Option<Lovelace>) -> CustomTransactionIdBuilder {
//   let current_treasury_amount_bytes = builtin.serialise_data(current_treasury_amount)

//   CustomTransactionIdBuilder {
//     ..self,
//     current_treasury_amount: Some(current_treasury_amount_bytes)
//   }
// }

fn with_treasury_donation(self: CustomTransactionIdBuilder, treasury_donation: Option<Lovelace>) -> CustomTransactionIdBuilder {
  let treasury_donation_bytes = builtin.serialise_data(treasury_donation)

  CustomTransactionIdBuilder {
    ..self,
    treasury_donation: Some(treasury_donation_bytes)
  }
}

fn with_current_treasury_amount(self: CustomTransactionIdBuilder, current_treasury_amount: Option<Lovelace>) -> CustomTransactionIdBuilder {
  let current_treasury_amount_bytes = builtin.serialise_data(current_treasury_amount)

  CustomTransactionIdBuilder {
    ..self,
    current_treasury_amount: Some(current_treasury_amount_bytes)
  }
}

fn build_custom_transaction_id(builder: CustomTransactionIdBuilder) -> CustomTransactionId {
  let attach = fn (a: ByteArray, b: Option<ByteArray>) -> ByteArray {
    expect Some(element) = b
    bytearray.concat(a, element)
  }

  expect Some(mint) = builder.mint
  let blob = mint
    |> attach(builder.treasury_donation)
    |> attach(builder.current_treasury_amount)
    // |> attach(builder.validity_range)
  // let blob = reference_inputs 
  //   // |> attach(builder.reference_inputs)
  //   // |> attach(builder.outputs)
  //   // |> attach(builder.fee)
  //   // |> attach(builder.mint)
  //   // |> attach(builder.certificates)
  //   // |> attach(builder.withdrawals)
  //   // |> attach(builder.extra_signatories)
  //   // |> attach(builder.redeemers)
  //   // |> attach(builder.datums)
  //   // |> attach(builder.votes)
  //   // |> attach(builder.proposal_procedures)
  //   // |> attach(builder.current_treasury_amount)
  //   // |> attach(builder.treasury_donation)
  trace @"blob": blob
  sha2_256(blob)
}

pub fn custom_transaction_id(tx: Transaction) -> ByteArray {
  trace @"inside custom_transaction_id"
  let builder = new_custom_transaction_id()
                  |> with_mint(tx.mint)
                  |> with_treasury_donation(tx.treasury_donation)
                  |> with_current_treasury_amount(tx.current_treasury_amount)
                     // |> with_validity_range(tx.validity_range)
  //                 // |> with_extra_signatories(tx.extra_signatories)
  //                 // |> with_certificates(tx.certificates)
  //                 // |> with_withdrawals(tx.withdrawals)
  //                 // |> with_votes(tx.votes)
  //                 // |> with_proposal_procedures(tx.proposal_procedures)
  //                 // |> with_reference_inputs(tx.reference_inputs)
  //                 // |> with_fee(tx.fee)
  //                 // |> with_datums(tx.datums)
  //                 // |> with_redeemers(tx.redeemers)
  //                 // |> with_inputs(tx.inputs)
  //                 // |> with_outputs(tx.outputs)
  build_custom_transaction_id(builder)
}

test basic_sanity_check() {
  let placeholder = transaction.placeholder
  let tx_id = custom_transaction_id(placeholder)
  tx_id != transaction.placeholder.id
}
