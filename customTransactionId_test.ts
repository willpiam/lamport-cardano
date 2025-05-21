import { assertExists } from "@std/assert/exists";
import { CustomTransactionIdBuilder, CustomTransactionId } from "./customTransactionId.ts";
import {
  applyParamsToScript,
  Constr,
  Data,
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  mintingPolicyToId,
  paymentCredentialOf,
  scriptFromNative,
  SpendingValidator,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";

const alice = generateEmulatorAccount({
  lovelace: 100_000_000n, // 100 ada
});

const emulator = new Emulator([alice]);
const lucid = await Lucid(emulator, "Custom");
lucid.selectWallet.fromSeed(alice.seedPhrase);

Deno.test("Custom Transaction Id - build from a simple transaction", async () => {

    const tx = await lucid.newTx()
        .pay.ToAddress(await lucid.wallet().address(), {
            lovelace: 1_000_000n,
        })
        .complete()

    const txObj : any = tx.toJSON()
    console.log(txObj)

    const customTransactionIdBuilder = new CustomTransactionIdBuilder()
        .withInputs(txObj.body.inputs)
        .withReferenceInputs(txObj.body.reference_inputs)
        .withOutputs(txObj.body.outputs)
        .withFee(txObj.body.fee)

    const customTransactionId = await customTransactionIdBuilder.build()

    console.log(customTransactionId)




});