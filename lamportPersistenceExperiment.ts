// create a lamport object

import { compareKeys, generateSeed, Lamport } from "./Lamport.ts";

const keyStrength = 256;
const lamport = new Lamport(await generateSeed(), keyStrength);
const privateKey : [Uint8Array[], Uint8Array[]] = await lamport.privateKey();

// save it to a file (inside /lamportPersistence)
const json = JSON.stringify(lamport.toJSON(), null, 2);
await Deno.writeTextFile("./lamportPersistence/lamportExperiment1.json", json);

// read it from a file
const json2 = await Deno.readTextFile("./lamportPersistence/lamportExperiment1.json");
const lamport2 = Lamport.fromJSON(JSON.parse(json2));

console.log(lamport2.initialSecret);

const privateKey2 : [Uint8Array[], Uint8Array[]] = await lamport2.privateKey();
console.log(privateKey2);

// compaire the two private keys
const isSame = compareKeys(privateKey, privateKey2, keyStrength);
console.log(isSame ? "Same private key" : "Different private key");
