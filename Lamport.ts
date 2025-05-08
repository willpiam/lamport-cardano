import crypto from 'node:crypto';
import { sha256 } from './sha256.ts';
import { toHex } from "npm:@blaze-cardano/core";
import { Buffer } from "node:buffer";

/*
    A class for creating and using lamport keys & signatures
*/

type LamportKey = [Uint8Array[], Uint8Array[]];
type LamportSignature = Uint8Array[];
type LamportPublicKey = LamportKey;
type LamportPrivateKey = LamportKey;

const generateSeed = async () => await sha256(new Uint8Array(crypto.randomBytes(32)))

const uint8ArrayToBinaryString = (uint8arr: Uint8Array): string => Array.from(uint8arr, byte => byte.toString(2).padStart(8, '0')).join('');

const validateKey = (key: LamportKey, keyStrength : number): boolean => {
    // key is a tuple of two arrays of 256 elements each
    if (key.length !== 2)
        return false;

    const [group1, group2] = key;
    if (group1.length !== keyStrength || group2.length !== keyStrength)
        return false;

    // no duplicate elements
    const seen = new Set<string>();

    for (const arr of [...group1, ...group2]) {
        const asHex = Buffer.from(arr).toString("hex");
        if (seen.has(asHex))
            return false;
        seen.add(asHex);
    }

    return true;
};

const signatureToHex = (signature: LamportSignature): string[] => signature.map(toHex);

const keyToHex = (key: LamportKey): [string[], string[]] => {
    const [group1, group2] = key;
    return [group1.map(toHex), group2.map(toHex)];
}

class Lamport {
    initialSecret: Uint8Array;
    textEncoder: TextEncoder;
    keyStrength: number;

    constructor(initialSecret: Uint8Array, keyStrength: number) {
        if (keyStrength > 256) 
            throw new Error("Key strength cannot be greater than 256");
        
        this.initialSecret = initialSecret;
        this.keyStrength = keyStrength;
        this.textEncoder = new TextEncoder()
    }

    async privateKey(): Promise<LamportPrivateKey> {
        const left = [];
        const right = [];

        for (let i = 0; i < this.keyStrength; i++) {
            const generateElement = (side: number): string => `${toHex(this.initialSecret)}:${i.toString(16)}:${Number(side).toString(16)}`
            left.push(await sha256(this.textEncoder.encode(generateElement(0))));
            right.push(await sha256(this.textEncoder.encode(generateElement(1))));
        }

        return [left, right];
    }

    async publicKey(): Promise<LamportPublicKey> {
        const [left, right] = await this.privateKey();

        const pub: LamportPublicKey = [[], []];

        for (let i = 0; i < this.keyStrength; i++) {
            pub[0].push(await sha256(left[i]));
            pub[1].push(await sha256(right[i]));
        }

        return pub;
    }

    async sign(message: Uint8Array): Promise<LamportSignature> {
        const msgHash = await sha256(message);
        const binaryHash = uint8ArrayToBinaryString(msgHash);

        const [left, right] = await this.privateKey();

        const signature: LamportSignature = [];

        for (let i = 0; i < this.keyStrength; i++) {
            const bit = binaryHash[i];
            signature.push(bit === '0' ? left[i] : right[i]);
        }

        return signature;
    }

    static async verify(message: Uint8Array, signature: LamportSignature, publicKey: LamportPublicKey, keyStrength : number ) : Promise<boolean> {
        const msgHash = await sha256(message);
        const binaryHash = uint8ArrayToBinaryString(msgHash);

        // check if the signature is the right format
        if (signature.length !== keyStrength) {
            console.error(`Signature length does not match expected key strength`);
            return false;
        }

        // ensure the public key is valid
        if (!validateKey(publicKey, keyStrength)) {
            console.error("Invalid public key");
            return false;
        }

        for (let i = 0; i < keyStrength; i++) {
            const bit = binaryHash[i];
            const pubElement : Uint8Array = bit === '0' ? publicKey[0][i] : publicKey[1][i];
            if (toHex(pubElement) !== toHex(await sha256(signature[i]))) {
                return false;
            }
        }

        return true;
    }

    toJSON () {
        return {
            ts_persisted: (new Date()).toLocaleString(),
            initialSecret: Array.from(this.initialSecret),
            keyStrength: this.keyStrength
        }
    }

    static fromJSON(json: any) {
        return new Lamport(new Uint8Array(json.initialSecret), json.keyStrength);
    }
}

export {
    Lamport,
    generateSeed,
    uint8ArrayToBinaryString,
    validateKey,
    keyToHex,
    signatureToHex,
    type LamportKey,
    type LamportSignature,
    type LamportPublicKey,
    type LamportPrivateKey
}