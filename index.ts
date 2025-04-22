import {
  applyParamsToScript,
  Blockfrost,
  Constr,
  Data,
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  LucidEvolution,
  mintingPolicyToId,
  Network,
  paymentCredentialOf,
  scriptFromNative,
  SpendingValidator,
  validatorToAddress,
} from "npm:@lucid-evolution/lucid";
import blueprint from "./lamport-validator/plutus.json" with { type: "json" };
import { generateSeed, Lamport, signatureToHex } from "./Lamport.ts";
import { toHex } from "npm:@blaze-cardano/core";

/*
    Use Lucid Evolution for off-chain logic instead of Mesh or Lucid
    index.ts
    William Doyle
*/

// part 0: setup
const tokenName = `Lamport Test (${Date.now()})`;
console.log("tokenName", tokenName);
const txPrefix = `https://preview.cardanoscan.io/transaction/`;
const txHashes: string[] = [];
const color = "color: green";
const title = (part: number, title: string) =>
  console.log(`%c--- PART ${part}: ${title} ---`, color);
title(0, "SETUP");
const KEY_STRENGTH = 63;

const makeLucid = (): Promise<[LucidEvolution, () => Promise<void>]> => {
  const delay = (length: number) => async (): Promise<void> => {
    console.log("delaying for", length, "seconds");
    return await new Promise((resolve) => setTimeout(resolve, length * 1000));
  };
  const makeEmulatorLucid = async (): Promise<
    [LucidEvolution, () => Promise<void>]
  > => {
    const alice = generateEmulatorAccount({
      lovelace: 100_000_000n, // 100 ada
    });

    const emulator = new Emulator([alice]);
    const lucid = await Lucid(emulator, "Custom");
    lucid.selectWallet.fromSeed(alice.seedPhrase);
    return [lucid, async () => {}];
  };

  const makeLiveLucid = async (
    network: string,
  ): Promise<[LucidEvolution, () => Promise<void>]> => {
    const seed = Deno.env.get("SEED_PHRASE");
    if (!seed) {
      throw new Error("SEED is not set");
    }
    const blockfrostApiKey = Deno.env.get("BLOCKFROST_API_KEY");
    if (!blockfrostApiKey) {
      throw new Error("BLOCKFROST_API_KEY is not set");
    }

    const lucid = await Lucid(
      new Blockfrost(
        `https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`,
        blockfrostApiKey,
      ),
      network as Network,
    );
    lucid.selectWallet.fromSeed(seed);
    console.log("address", await lucid.wallet().address());
    return [lucid, delay(30)];
  };
  // if the command line argument includes --emulator, run the emulator
  if (Deno.args.includes("--emulator")) {
    return makeEmulatorLucid();
  }
  const network = Deno.env.get("NETWORK");
  if (!network) {
    throw new Error("NETWORK is not set");
  }
  return makeLiveLucid(network);
};

const [lucid, delay] = await makeLucid();
const provider = lucid.config().provider!;
const userAddress = await lucid.wallet().address();

// part 1: mint a token
title(1, "MINT A TOKEN");
const mintingPolicy = scriptFromNative({
  type: "all",
  scripts: [
    {
      type: "sig",
      keyHash: paymentCredentialOf(userAddress).hash,
    },
  ],
});

const policyId = mintingPolicyToId(mintingPolicy);
const unit = policyId + fromText(tokenName);
{
  const tx = await lucid
    .newTx()
    .mintAssets({
      [unit]: 1n,
    })
    .pay.ToAddress(userAddress, { [unit]: 1n })
    .validTo(Date.now() + 900000)
    .attach.MintingPolicy(mintingPolicy)
    .attachMetadata(674, ["Mint token for Lamport test", "William Doyle the $computerman", "Based on work done at PauliGroup.eth", "https://pauli.group/"])
    .attachMetadata(721, {
      [policyId]: {
        "name": tokenName,
        "image": "https://robohash.org/something.jpg",
        "mediaType": "image/jpeg",
        "description": "A test token for the Lamport validator",
        "files": []
      },
      "version": 2
    })
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log("txHash", txHash);
  txHashes.push(txHash);
  await lucid.awaitTx(txHash);
  await delay();
  // verify the token is on alice's address
  const utxo = await provider.getUtxoByUnit(unit);
  console.assert(
    utxo.address === userAddress,
    "Token must be minted to user's address",
  );
}

// part 2: lock assets in the lamport validator
title(2, "LOCK ASSETS IN THE LAMPORT VALIDATOR");
// part 2.1: build the validator
const rawValidator =
  blueprint.validators.find((v) => v.title === "lamport.lamport.spend")!
    .compiledCode;
const parameterizedValidator = applyParamsToScript(
  rawValidator,
  [
    0n, // version
    BigInt(KEY_STRENGTH), // strength
  ],
);

const validator: SpendingValidator = {
  type: "PlutusV3",
  script: parameterizedValidator,
};

const lockAddress = validatorToAddress(
  "Custom",
  validator,
  getAddressDetails(userAddress).stakeCredential,
);

// part 2.2: build the datum
const lamport = new Lamport(await generateSeed(), KEY_STRENGTH);
const [pubLeft, pubRight] = await lamport.publicKey();
const encoder = new TextEncoder();
const message = encoder.encode(
  "This is a test of lamport signatures! Love from $computerman",
);
const lamportDatum = Data.to(
  new Constr(0, [pubLeft.map(toHex), pubRight.map(toHex), toHex(message)]),
);
// part 2.3: lock the assets
{
  const tx = await lucid
    .newTx()
    .pay.ToContract(lockAddress, { kind: "inline", value: lamportDatum }, {
      [unit]: 1n,
    })
    .attachMetadata(674, "Lock token for in Lamport validator")
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log("txHash", txHash);
  txHashes.push(txHash);
  await lucid.awaitTx(txHash);
  await delay();
  const utxo = await provider.getUtxoByUnit(unit);
  console.assert(utxo.address === lockAddress, "Token must be locked");
}

// part 3: unlock assets from the lamport validator
title(3, "UNLOCK ASSETS FROM THE LAMPORT VALIDATOR");
const scriptUtxo = await provider.getUtxoByUnit(unit);

const lsignature = await lamport.sign(message);

const redeemer = Data.to(
  new Constr(0, [toHex(message), signatureToHex(lsignature)]),
);

{
  const tx = await lucid
    .newTx()
    .collectFrom([scriptUtxo], redeemer)
    .attach.SpendingValidator(validator)
    .pay.ToAddress(userAddress, { [unit]: 1n })
    .attachMetadata(674, "Unlock token from Lamport validator")
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();
  txHashes.push(txHash);
  console.log("txHash", txHash);
  await lucid.awaitTx(txHash);
  await delay();

  const utxo = await provider.getUtxoByUnit(unit);
  console.assert(
    utxo.address === userAddress,
    "Token must be unlocked and present on user's address",
  );
}

// part 4: burn the token ( I like to clean up after myself)
title(4, "BURN THE TOKEN");
{
  const tx = await lucid
    .newTx()
    .attach.MintingPolicy(mintingPolicy)
    .mintAssets({
      [unit]: -1n,
    })
    .attachMetadata(674, "Clean up after Lamport test by burning token")
    .complete();

  const signed = await tx.sign.withWallet().complete();
  const txHash = await signed.submit();
  console.log("txHash", txHash);
  txHashes.push(txHash);
  await Deno.writeTextFile("txHashes.json", JSON.stringify(txHashes.map(h => `${txPrefix}${h}`), null, 2));
  await lucid.awaitTx(txHash);
  await delay();
  const utxo = await provider.getUtxoByUnit(unit);
  console.assert(utxo === undefined, "Token must no longer exist");
}

await Deno.writeTextFile("txHashes.json", JSON.stringify(txHashes.map(h => `${txPrefix}${h}`), null, 2));
console.log("Simulation complete.");

