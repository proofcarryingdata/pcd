import {
  PCD,
  PCDArgument,
  PCDPackage,
  SerializedPCD,
  StringArgument
} from "@pcd/pcd-types";
import JSONBig from "json-bigint";
import { v4 as uuid } from "uuid";
import { gzip } from "pako";

import { EzklSecretPCD, EzklSecretPCDPackage } from "@pcd/ezkl-secret-pcd";
import { EzklDisplayPCD, EzklDisplayPCDPackage } from "@pcd/ezkl-display-pcd";

async function getVerify() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const verify = module.verify;
    return verify;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

function stringToFloat(str: string) {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str.charCodeAt(i).toString();
  }
  return parseFloat(result);
}

function unit8ArrayToJsonObect(uint8Array: Uint8Array) {
  // let string = new TextDecoder("utf-8").decode(uint8Array);
  let string = new TextDecoder().decode(uint8Array);
  let jsonObject = JSON.parse(string);
  return jsonObject;
}

async function getInit() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const init = module.default;
    return init;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

async function getProve() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const init = module.prove;
    return init;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

async function getGenWitness() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const genWitness = module.genWitness;
    return genWitness;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

async function getFloatToVecU64() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const floatToVecU64 = module.floatToVecU64;
    return floatToVecU64;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

async function getPoseidonHash() {
  try {
    const module = await import("@ezkljs/engine/web/ezkl");
    const poseidonHash = module.poseidonHash;
    return poseidonHash;
  } catch (err) {
    console.error("Failed to import module:", err);
  }
}

export const EzklGroupPCDTypeName = "ezkl-group-pcd";

// export interface EzklGroupPCDArgs {
//   group: "GROUP1";
//   witness: Uint8ClampedArray;
//   pk: Uint8ClampedArray;
//   model: Uint8ClampedArray;
//   settings: Uint8ClampedArray;
//   srs: Uint8ClampedArray;
// }

export interface EzklGroupPCDArgs {
  displayPCD: PCDArgument<EzklDisplayPCD>;
}

export interface EzklGroupPCDClaim {
  // identity: Uint8ClampedArray;
  // hash: Uint8ClampedArray;
  groupName: "GROUP1";
}

export interface EzklGroupPCDProof {
  // proof: Uint8ClampedArray;
  proof: string;
  // witness: Uint8ClampedArray;
}

export class EzklGroupPCD implements PCD<EzklGroupPCDClaim, EzklGroupPCDProof> {
  type = EzklGroupPCDTypeName;
  claim: EzklGroupPCDClaim;
  proof: EzklGroupPCDProof;
  id: string;

  public constructor(
    id: string,
    claim: EzklGroupPCDClaim,
    proof: EzklGroupPCDProof
  ) {
    this.id = id;
    this.claim = claim;
    this.proof = proof;
  }
}

export async function prove(args: EzklGroupPCDArgs): Promise<EzklGroupPCD> {
  if (!args.displayPCD.value) {
    throw new Error("Cannot make group proof: missing secret pcd");
  }
  const displayPCD = await EzklDisplayPCDPackage.deserialize(
    args.displayPCD.value.pcd
  );
  const { secretPCD } = displayPCD.proof;

  const genWitness = await getGenWitness();
  const init = await getInit();

  if (!init) {
    throw new Error("Failed to import module init");
  }
  await init(
    "http://localhost:3000/ezkl-artifacts/ezkl_bg.wasm",
    new WebAssembly.Memory({ initial: 20, maximum: 1024, shared: true })
  );

  if (!genWitness) {
    throw new Error("Failed to import module genWitness");
  }

  // FETCH COMPILED MODEL
  const compiliedModelResp = await fetch("/ezkl-artifacts/network.compiled");
  if (!compiliedModelResp.ok) {
    throw new Error("Failed to fetch network.compiled");
  }
  const modelBuf = await compiliedModelResp.arrayBuffer();
  const model = new Uint8ClampedArray(modelBuf);

  // FETCH SETTINGS
  const settingsResp = await fetch("/ezkl-artifacts/settings.json");
  if (!settingsResp.ok) {
    throw new Error("Failed to fetch settings.json");
  }
  const settingsBuf = await settingsResp.arrayBuffer();
  const settings = new Uint8ClampedArray(settingsBuf);

  const { clearSecret } = secretPCD.proof;
  const float = stringToFloat(clearSecret);

  const floatToVecU64 = await getFloatToVecU64();
  if (!floatToVecU64) {
    throw new Error("Float to vec u64 not found");
  }
  const u64Ser = floatToVecU64(float, 0);
  const u64Output = unit8ArrayToJsonObect(new Uint8Array(u64Ser.buffer));
  const u64Array = [u64Output];
  const string = JSONBig.stringify(u64Array);
  const buffer = new TextEncoder().encode(string);
  const u64sOutputSer = new Uint8ClampedArray(buffer.buffer);
  const poseidonHash = await getPoseidonHash();
  if (!poseidonHash) {
    throw new Error("Poseidon hash not found");
  }
  const hash = await poseidonHash(u64sOutputSer);
  const hashString = new TextDecoder().decode(hash);
  const jsonHash = JSONBig.parse(hashString);
  const inputObj = {
    input_data: jsonHash,
    output_data: [[]]
  };
  const jsonWitness = JSONBig.stringify(inputObj);
  const encodedWitness = new TextEncoder().encode(jsonWitness);
  const witnessInput = new Uint8ClampedArray(encodedWitness.buffer);

  const witness = new Uint8ClampedArray(
    genWitness(model, witnessInput, settings)
  );

  // FETCH PK
  const pkResp = await fetch("/ezkl-artifacts/test.pk");
  if (!pkResp.ok) {
    throw new Error("Failed to fetch pk.key");
  }
  const pkBuf = await pkResp.arrayBuffer();
  const pk = new Uint8ClampedArray(pkBuf);

  // FETCH SRS
  const srsResp = await fetch("/ezkl-artifacts/kzg.srs");
  if (!srsResp.ok) {
    throw new Error("Failed to fetch kzg.srs");
  }
  const srsBuf = await srsResp.arrayBuffer();
  const srs = new Uint8ClampedArray(srsBuf);

  const ezklProve = await getProve();
  if (!ezklProve) {
    throw new Error("Failed to import module");
  }
  const proof = new Uint8ClampedArray(
    await ezklProve(witness, pk, model, settings, srs)
  );
  const compressedData = new Uint8ClampedArray(gzip(proof, { level: 9 }));

  function convertCompressedDataToString(compressedData: Uint8ClampedArray) {
    let string = "";
    for (let i = 0; i < compressedData.length; i++) {
      // string += String.fromCharCode(compressedData[i]);
      const elmToStr = compressedData[i].toString();
      if (elmToStr.length === 1) {
        string += "00" + elmToStr;
      } else if (elmToStr.length === 2) {
        string += "0" + elmToStr;
      } else {
        string += elmToStr;
      }
    }
    return string;
  }

  const compressedDataStr = convertCompressedDataToString(compressedData);

  const verify = await getVerify();
  if (!verify) {
    throw new Error("Failed to import module verify");
  }

  // LOAD VK
  const vkResp = await fetch("/ezkl-artifacts/test.vk");
  if (!vkResp.ok) {
    throw new Error("Failed to fetch test.vk");
  }
  const vkBuf = await vkResp.arrayBuffer();
  const vk = new Uint8ClampedArray(vkBuf);

  const verified = await verify(proof, vk, settings, srs);
  console.log("VERIFIED", verified);

  return new EzklGroupPCD(
    uuid(),
    { groupName: "GROUP1" },
    // { proof: compressedData }
    { proof: compressedDataStr }
  );
}

export async function verify(pcd: EzklGroupPCD): Promise<boolean> {
  return true;
  // const ezklVerify = await getVerify();
  // if (!ezklVerify) {
  //   throw new Error("Failed to import module");
  // }

  // const vk = "vk.key" as unknown as Uint8ClampedArray;
  // const settings = "settings.json" as unknown as Uint8ClampedArray;
  // const srs = "kzg.srs" as unknown as Uint8ClampedArray;
  // const verified = await ezklVerify(
  //   new Uint8ClampedArray(pcd.proof.hex),
  //   vk,
  //   settings,
  //   srs
  // );

  // return verified;
}

export async function serialize(
  pcd: EzklSecretPCD
): Promise<SerializedPCD<EzklSecretPCD>> {
  return {
    type: EzklGroupPCDTypeName,
    pcd: JSONBig().stringify(pcd)
  } as SerializedPCD<EzklSecretPCD>;
}

export async function deserialize(serialized: string): Promise<EzklSecretPCD> {
  return JSONBig().parse(serialized);
}

export const EzklGroupPCDPackage: PCDPackage = {
  name: EzklGroupPCDTypeName,
  prove,
  verify,
  serialize,
  deserialize
};
