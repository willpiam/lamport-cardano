# Lamport Proof Of Concept

In this Proof-Of-Concept an NFT is minted and locked in a validator with a Lamport public key and an expected message in the datum. In order to unlock the NFT a Lamport signature must be provided via the redeemer. That signature must match with the expected message and public key. 

## Primary Files

### On-Chain

`/lamport-validator/validators/lamport.ak`

### Off-Chain

`index.ts`

## Running (fully local test)

### Build

```bash
cd lamport-validator
aiken build
```
Please note that if you have `plutus.json` in the `lamport-validator` folder the smart contract is already compiled. 

## Available Tasks

- `deno task dev` - Run the project in watch mode
- `deno task run` - Run the project
- `deno task run:emulator` - Run the project entierly locally by using an emulator
- `deno task run:preview` - Run the project on the preview testnet
- `deno task persistenceTest` - Run the persistence experiment
- `deno task lamportExperiment` - Run the off-chain experiment

## Available Tests
- `deno test test_offchain.ts` - Run off-chain tests
- `deno test lamport_test.ts --allow-read` - Run on-chain tests (emulated)

## dotenv

```ini
BLOCKFROST_API_KEY=""
SEED_PHRASE=""
NETWORK="Preview"
```

## Demo

With strength set to 63

- [Mint](https://preview.cardanoscan.io/transaction/8122fbe51d5826ee3a48147ff628cdd01be6923d5f4b3584f3f5a45a595177b0)
- [Lock](https://preview.cardanoscan.io/transaction/3857202173e57f1e4a17f79aae7a441d11638ad4e4d9f0fd303b685c80ce6766)
- [Unlock](https://preview.cardanoscan.io/transaction/eb5f4c1350987fc15d9fad530c659fee952f5d67dd6664796684ef96773bc84b)
- [Burn](https://preview.cardanoscan.io/transaction/a3da7cab90612c546fd36687237354fa83946d989ccb402f4c7c697d6d3bfccb)

The actual verification of the Lamport signature happens during the *unlock* step.

## Questions

### Making an account

How can we prevent replay attacks in a Lamport signature scheme where the message being signed needs to uniquely identify the transaction, but the signature itself (stored in the redeemer) affects the transaction hash?

### Verification Over Many Transactions

Is there some way in which I can verify a lamport signature over multiple transactions?




## Related Work

| Title                               | Reference                             |
| ----------------------------------- | ------------------------------------- | 
| LAMB Whitepaper                     | https://anchorwallet.ca/whitepaper/   |
| Anchor Vault (EVM) Chrome Plugin    | https://chromewebstore.google.com/detail/anchor-vault/omifklijimcjhfiojhodcnfihkljeali |
| LAMB Account Factory On Ethereum    | https://etherscan.io/address/0xBbec2f0bd58EA433BB38ac8ed699DED914087D6f#code           |



