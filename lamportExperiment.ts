import { toHex } from "npm:@blaze-cardano/core";
import { Lamport, generateSeed, keyToHex, signatureToHex, uint8ArrayToBinaryString, validateKey } from "./Lamport.ts";

const KEY_STRENGTH = 128;
const lamport = new Lamport(await generateSeed(), KEY_STRENGTH);

console.log(`Initial Secret --> ${toHex(lamport.initialSecret)}`);

const secretBinary = uint8ArrayToBinaryString(lamport.initialSecret);

console.log(secretBinary);

console.log(`secret is ${secretBinary.length} bits long`);

if (secretBinary.length !== 256) {
    console.error("Secret is not 256 bits long");
    Deno.exit(1);
}

const privateKey = await lamport.privateKey();

console.log(keyToHex(privateKey));

const isPriValid = validateKey(privateKey, KEY_STRENGTH);

console.log(isPriValid ? "Valid private key" : "Invalid private key");

if (!isPriValid) 
    Deno.exit(1); 

const publicKey = await lamport.publicKey();
const isPubValid = validateKey(publicKey, KEY_STRENGTH);

console.log(isPubValid ? "Valid public key" : "Invalid public key");
if (!isPubValid) 
    Deno.exit(1);

const message = "Hello, World!";
const encoder = new TextEncoder();
const messageBytes = encoder.encode(message);

const signature : Uint8Array[] = await lamport.sign(messageBytes);

console.log("Signature --> ", signatureToHex(signature));

const isValidSignature = await Lamport.verify(messageBytes, signature, publicKey, KEY_STRENGTH);
console.log(isValidSignature ? "Valid signature" : "Invalid signature");


if (!isValidSignature) 
    Deno.exit(1);


{   // expected to fail - tampered message
    const wrongMessage = "hello bad world";
    const wrongMessageBytes = encoder.encode(wrongMessage);

    const isValidSignature2 = await Lamport.verify(wrongMessageBytes, signature, publicKey, KEY_STRENGTH);

    console.log(isValidSignature2 ? "(unexpected) Valid signature" : "(expected) Invalid signature");

    if (isValidSignature2) 
        Deno.exit(1);
}

{   // expected to fail - tampered signature (change the last element)
    const tamperedSignature = signature.slice(0, signature.length - 1);
    tamperedSignature.push(new Uint8Array([0]));

    const isValidSignature3 = await Lamport.verify(messageBytes, tamperedSignature, publicKey, KEY_STRENGTH);

    console.log(isValidSignature3 ? "(unexpected) Valid signature" : "(expected) Invalid signature");

    if (isValidSignature3) 
        Deno.exit(1);
}