import { EdDSAPCDPackage } from "@pcd/eddsa-pcd";
import {
  EthereumGroupPCDPackage,
  getRawPubKeyBuffer,
  GroupType
} from "@pcd/ethereum-group-pcd";
import { EthereumOwnershipPCDPackage } from "@pcd/ethereum-ownership-pcd";
import {
  gpcArtifactDownloadURL,
  GPCArtifactSource,
  GPCArtifactStability,
  GPCArtifactVersion,
  JSONPODMembershipLists,
  JSONProofConfig,
  podMembershipListsFromJSON,
  proofConfigFromJSON
} from "@pcd/gpc";
import { GPCPCDArgs, GPCPCDPackage } from "@pcd/gpc-pcd";
import {
  constructZupassPcdAddRequestUrl,
  constructZupassPcdMintRequestUrl,
  constructZupassPcdProveAndAddRequestUrl,
  openSignedZuzaluSignInPopup,
  useZupassPopupMessages
} from "@pcd/passport-interface";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import {
  decodePrivateKey,
  encodePublicKey,
  POD,
  podEntriesFromJSON
} from "@pcd/pod";
import { PODPCD, PODPCDPackage } from "@pcd/pod-pcd";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { WebAuthnPCDPackage } from "@pcd/webauthn-pcd";
import { Poseidon, Tree } from "@personaelabs/spartan-ecdsa";
import { Identity } from "@semaphore-protocol/identity";
import { startRegistration } from "@simplewebauthn/browser";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
import { derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { ethers } from "ethers";
import JSONBig from "json-bigint";
import { useEffect, useState } from "react";
import urlJoin from "url-join";
import { v4 as uuid } from "uuid";
import { HomeLink } from "../../components/Core";
import { ExampleContainer } from "../../components/ExamplePage";
import {
  EVERYONE_SEMAPHORE_GROUP_URL,
  GPC_ARTIFACT_CONFIG,
  MINT_SERVER_URL,
  ZUPASS_URL
} from "../../constants";
import {
  EXAMPLE_EDDSA_PRIVATE_KEY,
  EXAMPLE_EDDSA_PRIVATE_KEY2,
  EXAMPLE_GPC_CONFIG,
  EXAMPLE_MEMBERSHIP_LISTS,
  EXAMPLE_OWNER_IDENTITY,
  EXAMPLE_POD_CONTENT,
  EXAMPLE_POD_CONTENT_WITH_DISPLAY
} from "../../podExampleConstants";
import { sendZupassRequest } from "../../util";

export default function Page(): JSX.Element {
  const [signedMessage, setSignedMessage] = useState("1");
  const [folder, setFolder] = useState("");
  const [podContent, setPODContent] = useState(EXAMPLE_POD_CONTENT);
  const [podContent2, setPODContent2] = useState(
    EXAMPLE_POD_CONTENT_WITH_DISPLAY
  );
  const [podPrivateKey, _setPODPrivateKey] = useState(
    EXAMPLE_EDDSA_PRIVATE_KEY
  );
  const [podPublicKey, setPODPublicKey] = useState(
    encodePublicKey(
      derivePublicKey(decodePrivateKey(EXAMPLE_EDDSA_PRIVATE_KEY))
    )
  );
  const setPODPrivateKey = (key: string): void => {
    _setPODPrivateKey(key);
    setPODPublicKey(encodePublicKey(derivePublicKey(decodePrivateKey(key))));
  };
  const [podPrivateKey2, _setPODPrivateKey2] = useState(
    EXAMPLE_EDDSA_PRIVATE_KEY2
  );
  const [podPublicKey2, setPODPublicKey2] = useState(
    encodePublicKey(
      derivePublicKey(decodePrivateKey(EXAMPLE_EDDSA_PRIVATE_KEY2))
    )
  );
  const setPODPrivateKey2 = (key: string): void => {
    _setPODPrivateKey2(key);
    setPODPublicKey2(encodePublicKey(derivePublicKey(decodePrivateKey(key))));
  };
  const [podMintUrl, setPODMintUrl] = useState(
    urlJoin(MINT_SERVER_URL, "api/sign")
  );
  const [gpcConfig, setGPCConfig] = useState(EXAMPLE_GPC_CONFIG);
  const [membershipLists, setMembershipLists] = useState(
    EXAMPLE_MEMBERSHIP_LISTS
  );
  const [podFolder, setPODFolder] = useState("Test PODs");
  const [podFolder2, setPODFolder2] = useState("Test PODs");
  const [gpcFolder, setGPCFolder] = useState("Test GPCs");
  const [webAuthnInfo, setWebAuthnInfo] = useState<WebAuthnInfo | null>(null);
  const [serializedWebAuthnPCD, setSerializedWebAuthnPCD] = useState<
    string | null
  >(null);

  return (
    <div>
      <HomeLink />
      <h2>Prove and Add</h2>
      <p>
        This page contains several examples of how to add PCDs to Zupass. You
        can add a PCD to Zupass in one of two ways:
      </p>
      <ul>
        <li>
          Add a PCD (which can be kind of dangerous if the user then expects
          that PCD to be private, as is the case for adding a raw Semaphore
          Identity).
        </li>
        <li>
          Prove, and <i>then</i> add the PCD to Zupass. The application that
          initiates this does not get a copy of the PCD back, it just adds it to
          Zupass.
        </li>
      </ul>
      <ExampleContainer>
        <button onClick={addGroupMembershipProofPCD}>
          prove and add a group membership proof
        </button>
        <br />
        <br />
        Message to sign:{" "}
        <textarea
          cols={40}
          rows={1}
          value={signedMessage}
          onChange={(e): void => {
            setSignedMessage(e.target.value);
          }}
        />
        <br />
        <label>
          Folder to add PCD to:
          <input
            type="text"
            value={folder}
            placeholder="Enter folder name..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setFolder(e.target.value);
            }}
          />
        </label>
        <br />
        <button
          onClick={(): Promise<void> =>
            addSignatureProofPCD(
              signedMessage,
              folder.length > 0 ? folder : undefined
            )
          }
        >
          prove and add a signature proof
        </button>
        <br />
        <br />
        <button onClick={addIdentityPCD}>
          add a new semaphore identity to Zupass
        </button>
        <br />
        <br />
        <button onClick={addWebAuthnPCD} disabled>
          add a new webauthn credential to Zupass [REMOVED FOR DEVCONNECT]
        </button>
        <br />
        <br />
        <AddEthAddrPCDButton />
        <br />
        <br />
        <AddEthGroupPCDButton />
        <br />
        <br />
        <button onClick={addEdDSAPCD}>add a new EdDSA signature proof</button>
      </ExampleContainer>
      <ExampleContainer>
        POD + GPC Examples
        <br />
        <br />
        Example POD content to sign: <br />
        <br />
        <textarea
          cols={45}
          rows={15}
          value={podContent}
          onChange={(e): void => {
            setPODContent(e.target.value);
          }}
        />
        <br />
        <button
          onClick={() =>
            addPODPCD(
              podContent,
              podPrivateKey,
              podFolder.length > 0 ? podFolder : undefined
            )
          }
        >
          add a new POD to Zupass
        </button>
        <br />
        <label>
          Private key to sign POD with:
          <input
            type="text"
            value={podPrivateKey}
            placeholder="Enter private key..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setPODPrivateKey(e.target.value);
            }}
          />
        </label>
        <br />
        Corresponding public key: <small>{podPublicKey}</small>
        <br />
        <label>
          Folder to add POD to:
          <input
            type="text"
            value={podFolder}
            placeholder="Enter folder name..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setPODFolder(e.target.value);
            }}
          />
        </label>
        <br />
        <br />
        Card POD content to sign and/or mint: <br />
        <br />
        <textarea
          cols={45}
          rows={15}
          value={podContent2}
          onChange={(e): void => {
            setPODContent2(e.target.value);
          }}
        />
        <br />
        <button
          onClick={() =>
            addPODPCD(
              podContent2,
              podPrivateKey2,
              podFolder2.length > 0 ? podFolder2 : undefined
            )
          }
        >
          add a new POD to Zupass (popup)
        </button>
        <button
          onClick={() =>
            addPODPCD(
              podContent2,
              podPrivateKey2,
              podFolder2.length > 0 ? podFolder2 : undefined,
              true
            )
          }
        >
          add a new POD to Zupass (redirect)
        </button>
        <br />
        <button
          onClick={() =>
            mintPODPCD(
              podMintUrl,
              podContent2,
              podPrivateKey2,
              podFolder2.length > 0 ? podFolder2 : undefined
            )
          }
        >
          mint a new POD in Zupass (popup)
        </button>
        <br />
        <label>
          Private key to sign POD with:
          <input
            type="text"
            value={podPrivateKey2}
            placeholder="Enter private key..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setPODPrivateKey2(e.target.value);
            }}
          />
        </label>
        <br />
        Corresponding public key: <small>{podPublicKey2}</small>
        <br />
        <label>
          Folder to add POD to:
          <input
            type="text"
            value={podFolder2}
            placeholder="Enter folder name..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setPODFolder2(e.target.value);
            }}
          />
        </label>
        <br />
        <label>
          Mint URL:
          <input
            type="text"
            value={podMintUrl}
            placeholder="Enter mint URL..."
            style={{ width: "200px", marginLeft: "16px" }}
            onChange={(e): void => {
              setPODMintUrl(e.target.value);
            }}
          />
        </label>
        <br />
        <br />
        GPC Proof config: <br />
        <textarea
          cols={45}
          rows={15}
          value={gpcConfig}
          onChange={(e): void => {
            setGPCConfig(e.target.value);
          }}
        />
        <br />
        Membership lists: <br />
        <textarea
          cols={45}
          rows={15}
          value={membershipLists}
          onChange={(e): void => {
            setMembershipLists(e.target.value);
          }}
        />
        <br />
        <label>
          Folder to add GPC to:
          <input
            type="text"
            value={gpcFolder}
            placeholder="Enter folder name..."
            style={{ marginLeft: "16px" }}
            onChange={(e): void => {
              setGPCFolder(e.target.value);
            }}
          />
        </label>
        <br />
        <button
          onClick={(): Promise<void> =>
            addGPCPCD(
              podContent,
              podContent2,
              gpcConfig,
              membershipLists,
              gpcFolder.length > 0 ? gpcFolder : undefined
            )
          }
        >
          add a GPC Proof to Zupass
        </button>
      </ExampleContainer>
      <ExampleContainer>
        Webauthn example: <br />
        <button
          onClick={async () => {
            try {
              const info = await registerWebAuthnCredential();
              setWebAuthnInfo(info);
              console.log("WebAuthn credential created successfully:", info);
            } catch (err) {
              console.error("Error creating WebAuthn credential:", err);
            }
          }}
        >
          Register new WebAuthn credential
        </button>
        <br />
        Example data to sign: <br />
        <br />
        <textarea
          cols={45}
          rows={15}
          value={podContent}
          onChange={(e): void => {
            setPODContent(e.target.value);
          }}
        />
        <br />
        <button
          onClick={async () => {
            if (!webAuthnInfo) {
              alert("Please register a WebAuthn credential first");
              return;
            }
            try {
              console.log("Data to sign:", JSON.stringify(podContent));
              const pcd = await signWithWebAuthn(
                JSON.stringify(podContent),
                webAuthnInfo
              );
              setSerializedWebAuthnPCD(pcd);
              console.log("Signed successfully with WebAuthn");
            } catch (err) {
              console.error("Error signing with WebAuthn:", err);
            }
          }}
          disabled={!webAuthnInfo}
        >
          Sign PCD with WebAuthn
        </button>
        <br />
        <button
          onClick={async () => {
            if (!serializedWebAuthnPCD) {
              alert("Please sign a message first");
              return;
            }
            try {
              await verifyWebAuthnPCD(serializedWebAuthnPCD);
              console.log("Verified successfully with WebAuthn");
            } catch (err) {
              console.error("Error verifying with WebAuthn:", err);
            }
          }}
          disabled={!serializedWebAuthnPCD}
        >
          Verify PCD with WebAuthn
        </button>
      </ExampleContainer>
    </div>
  );
}

function AddEthAddrPCDButton(): JSX.Element {
  const [pcdStr] = useZupassPopupMessages();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!pcdStr) return;
    if (!isActive) return;

    const parsed = JSON.parse(pcdStr) as SerializedPCD;

    if (!("ethereum" in window)) {
      alert("Please install MetaMask to use this dApp!");
    } else {
      const ethereum: ethers.providers.ExternalProvider | undefined =
        window.ethereum as ethers.providers.ExternalProvider;
      const provider = new ethers.providers.Web3Provider(ethereum);

      (async function (): Promise<void> {
        await ethereum.request?.({ method: "eth_requestAccounts" });
        const pcd = await SemaphoreSignaturePCDPackage.deserialize(parsed.pcd);
        const signature = await provider
          .getSigner()
          .signMessage(pcd.claim.identityCommitment);

        const popupUrl = window.location.origin + "#/popup";

        const proofUrl = constructZupassPcdProveAndAddRequestUrl<
          typeof EthereumOwnershipPCDPackage
        >(ZUPASS_URL, popupUrl, EthereumOwnershipPCDPackage.name, {
          identity: {
            argumentType: ArgumentTypeName.PCD,
            pcdType: SemaphoreIdentityPCDPackage.name,
            value: undefined,
            userProvided: true,
            description:
              "The Semaphore Identity which you are proving owns the given Ethereum address."
          },
          ethereumAddress: {
            argumentType: ArgumentTypeName.String,
            value: await provider.getSigner().getAddress()
          },
          ethereumSignatureOfCommitment: {
            argumentType: ArgumentTypeName.String,
            value: signature
          }
        });

        sendZupassRequest(proofUrl);
      })();
    }

    setIsActive(false);
  }, [pcdStr, isActive]);

  return (
    <button
      onClick={(): void => {
        setIsActive(true);
        zupassSignIn("eth-pcd");
      }}
    >
      add a new Ethereum address to Zupass
    </button>
  );
}

async function zupassSignIn(originalSiteName: string): Promise<void> {
  openSignedZuzaluSignInPopup(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    originalSiteName
  );
}

function AddEthGroupPCDButton(): JSX.Element {
  const [pcdStr] = useZupassPopupMessages();
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!pcdStr) return;
    if (!isActive) return;

    const parsed = JSON.parse(pcdStr) as SerializedPCD;

    if (!("ethereum" in window)) {
      alert("Please install MetaMask to use this dApp!");
    } else {
      const ethereum: ethers.providers.ExternalProvider | undefined =
        window.ethereum as ethers.providers.ExternalProvider;
      const provider = new ethers.providers.Web3Provider(ethereum);

      (async function (): Promise<void> {
        await ethereum.request?.({ method: "eth_requestAccounts" });
        const pcd = await SemaphoreSignaturePCDPackage.deserialize(parsed.pcd);

        const msgHash = Buffer.from(
          ethers.utils.hashMessage(pcd.claim.identityCommitment).slice(2),
          "hex"
        );
        const signatureOfIdentityCommitment = await provider
          .getSigner()
          .signMessage(pcd.claim.identityCommitment);

        const poseidon = new Poseidon();
        await poseidon.initWasm();
        const treeDepth = 20; // Provided circuits have tree depth = 20
        const pubKeyTree = new Tree(treeDepth, poseidon);

        // Add some public keys to the tree
        for (const member of [
          "0x04b4d5188949bf70c4db5e965a9ea67b80407e8ee7fa3a260ccf86e9c0395fe82cba155fdff55829b3c862322aba402d00b563861b603879ee8ae211c34257d4ad",
          "0x042d21e6aa2021a991a82d08591fa0528d0bebe4ac9a34d851a74507327d930dec217380bd602fe48a143bb21106ab274d6a51aff396f0e4f7e1e3a8a673d46d83"
        ]) {
          pubKeyTree.insert(poseidon.hashPubKey(getRawPubKeyBuffer(member)));
        }
        // Add the prover's public key to the tree
        const proverPubkeyBuffer: Buffer = getRawPubKeyBuffer(
          ethers.utils.recoverPublicKey(msgHash, signatureOfIdentityCommitment)
        );
        pubKeyTree.insert(poseidon.hashPubKey(proverPubkeyBuffer));
        const pubKeyIndex = pubKeyTree.indexOf(
          poseidon.hashPubKey(proverPubkeyBuffer)
        ); // == 2 in this test

        // Prove membership of the prover's public key in the tree
        const merkleProof = pubKeyTree.createProof(pubKeyIndex);

        const popupUrl = window.location.origin + "#/popup";
        const proofUrl = constructZupassPcdProveAndAddRequestUrl<
          typeof EthereumGroupPCDPackage
        >(ZUPASS_URL, popupUrl, EthereumGroupPCDPackage.name, {
          identity: {
            argumentType: ArgumentTypeName.PCD,
            pcdType: SemaphoreIdentityPCDPackage.name,
            value: undefined,
            userProvided: true,
            description:
              "The Semaphore Identity which you are signing the message."
          },
          groupType: {
            argumentType: ArgumentTypeName.String,
            value: GroupType.PUBLICKEY
          },
          signatureOfIdentityCommitment: {
            argumentType: ArgumentTypeName.String,
            value: signatureOfIdentityCommitment
          },
          merkleProof: {
            argumentType: ArgumentTypeName.String,
            value: JSONBig({ useNativeBigInt: true }).stringify(merkleProof)
          }
        });

        sendZupassRequest(proofUrl);
      })();
    }

    setIsActive(false);
  }, [pcdStr, isActive]);

  return (
    <button
      disabled
      onClick={(): void => {
        setIsActive(true);
        zupassSignIn("eth-group-pcd");
      }}
    >
      add a new Ethereum Group Membership to Zupass [REMOVED FOR DEVCONNECT]
    </button>
  );
}

async function addGroupMembershipProofPCD(): Promise<void> {
  const url = constructZupassPcdProveAndAddRequestUrl<
    typeof SemaphoreGroupPCDPackage
  >(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    SemaphoreGroupPCDPackage.name,
    {
      externalNullifier: {
        argumentType: ArgumentTypeName.BigInt,
        userProvided: true,
        value: "1",
        description:
          "You can choose a nullifier to prevent this signed message from being used across domains."
      },
      group: {
        argumentType: ArgumentTypeName.Object,
        userProvided: false,
        remoteUrl: EVERYONE_SEMAPHORE_GROUP_URL,
        description: "The Semaphore group which you are proving you belong to."
      },
      identity: {
        argumentType: ArgumentTypeName.PCD,
        pcdType: SemaphoreIdentityPCDPackage.name,
        value: undefined,
        userProvided: true,
        description:
          "The Semaphore Identity which you are signing the message on behalf of."
      },
      signal: {
        argumentType: ArgumentTypeName.BigInt,
        userProvided: true,
        value: "1",
        description: "The message you are signing with your Semaphore identity."
      }
    },
    {
      genericProveScreen: true,
      description:
        "Generate a group membership proof using your Zupass Semaphore Identity.",
      title: "Group Membership Proof"
    }
  );

  sendZupassRequest(url);
}

async function addEdDSAPCD(): Promise<void> {
  const proofUrl = constructZupassPcdProveAndAddRequestUrl<
    typeof EdDSAPCDPackage
  >(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    EdDSAPCDPackage.name,
    {
      message: {
        argumentType: ArgumentTypeName.StringArray,
        value: ["0x12345", "0x54321"],
        userProvided: true
      },
      privateKey: {
        argumentType: ArgumentTypeName.String,
        userProvided: false,
        value: EXAMPLE_EDDSA_PRIVATE_KEY
      },
      id: {
        argumentType: ArgumentTypeName.String,
        value: uuid(),
        userProvided: false
      }
    },
    { title: "EdDSA Signature Proof" }
  );

  sendZupassRequest(proofUrl);
}

async function addSignatureProofPCD(
  messageToSign: string,
  folder: string | undefined
): Promise<void> {
  const proofUrl = constructZupassPcdProveAndAddRequestUrl<
    typeof SemaphoreSignaturePCDPackage
  >(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    SemaphoreSignaturePCDPackage.name,
    {
      identity: {
        argumentType: ArgumentTypeName.PCD,
        pcdType: SemaphoreIdentityPCDPackage.name,
        value: undefined,
        userProvided: true
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        value: messageToSign,
        userProvided: false
      }
    },
    {
      title: "Semaphore Signature Proof"
    },
    false,
    folder
  );

  sendZupassRequest(proofUrl);
}

async function addIdentityPCD(): Promise<void> {
  const newIdentity = await SemaphoreIdentityPCDPackage.prove({
    identityV3: new Identity()
  });

  const serializedNewIdentity =
    await SemaphoreIdentityPCDPackage.serialize(newIdentity);

  const url = constructZupassPcdAddRequestUrl(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    serializedNewIdentity
  );

  sendZupassRequest(url);
}

type WebAuthnInfo = {
  credentialID: Uint8Array;
  credentialPublicKey: Uint8Array;
  counter: number;
};

async function registerWebAuthnCredential(): Promise<WebAuthnInfo> {
  // Register a new WebAuthn credential for testing.
  const generatedRegistrationOptions = await generateRegistrationOptions({
    rpName: "consumer-client",
    rpID: window.location.hostname,
    userID: "user-id",
    userName: "user",
    attestationType: "direct",
    challenge: "challenge",
    supportedAlgorithmIDs: [-7]
  });
  const startRegistrationResponse = await startRegistration(
    generatedRegistrationOptions
  );
  const verificationResponse = await verifyRegistrationResponse({
    response: startRegistrationResponse,
    expectedOrigin: window.location.origin,
    expectedChallenge: generatedRegistrationOptions.challenge,
    supportedAlgorithmIDs: [-7] // support ES256 signing algorithm
  });

  console.log(`verificationResponse`, verificationResponse);
  if (!verificationResponse.registrationInfo) {
    throw new Error("Registration failed the return correct response.");
  }

  // Get relevant credential arguments from registration response.
  const { credentialID, credentialPublicKey, counter } =
    verificationResponse.registrationInfo;

  return { credentialID, credentialPublicKey, counter };
}

async function signWithWebAuthn(
  dataToSign: string,
  webAuthnInfo: WebAuthnInfo
): Promise<string> {
  const { credentialID, credentialPublicKey, counter } = webAuthnInfo;

  try {
    // Create new WebAuthn PCD
    const PCD = await WebAuthnPCDPackage.prove({
      challenge: dataToSign, // arbitrary challenge to be signed
      origin: window.location.origin,
      rpID: window.location.hostname,
      authenticator: {
        credentialID,
        credentialPublicKey,
        counter
      }
    });

    console.log("WebAuthn PCD created:", PCD);

    const serializedPCD = await WebAuthnPCDPackage.serialize(PCD);

    console.log("Serialized PCD:", serializedPCD);

    return JSON.stringify(serializedPCD);
  } catch (err) {
    console.error("Error creating WebAuthn credential:", err);
    throw err;
  }
}

async function verifyWebAuthnPCD(serializedPCD: string): Promise<void> {
  const parsed = JSON.parse(serializedPCD) as SerializedPCD;
  console.log("Parsed serializedPCD:", parsed);
  const pcd = await WebAuthnPCDPackage.deserialize(parsed.pcd);
  console.log("Deserialized PCD:", pcd);
  const verified = await WebAuthnPCDPackage.verify(pcd);
  console.log("WebAuthn PCD verified:", verified);
}

async function addWebAuthnPCD(): Promise<void> {
  // Register a new WebAuthn credential for testing.
  const generatedRegistrationOptions = await generateRegistrationOptions({
    rpName: "consumer-client",
    rpID: window.location.hostname,
    userID: "user-id",
    userName: "user",
    attestationType: "direct",
    challenge: "challenge",
    supportedAlgorithmIDs: [-7]
  });
  const startRegistrationResponse = await startRegistration(
    generatedRegistrationOptions
  );
  const verificationResponse = await verifyRegistrationResponse({
    response: startRegistrationResponse,
    expectedOrigin: window.location.origin,
    expectedChallenge: generatedRegistrationOptions.challenge,
    supportedAlgorithmIDs: [-7] // support ES256 signing algorithm
  });

  if (!verificationResponse.registrationInfo) {
    throw new Error("Registration failed the return correct response.");
  }

  // Get relevant credential arguments from registration response.
  const { credentialID, credentialPublicKey, counter } =
    verificationResponse.registrationInfo;

  // Create new WebAuthn PCD. This process initiates the WebAuth
  // authentication ceremony, prompting a authorization gesture like
  // a fingerprint or Face ID scan, depending on the device.
  const newCredential = await WebAuthnPCDPackage.prove({
    rpID: window.location.hostname,
    authenticator: {
      credentialID,
      credentialPublicKey,
      counter
    },
    challenge: "1", // arbitrary challenge to be signed
    origin: window.location.origin
  });

  const serializedNewCredential =
    await WebAuthnPCDPackage.serialize(newCredential);

  // Add new WebAuthn PCD to Zupass.
  const url = constructZupassPcdAddRequestUrl(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    serializedNewCredential
  );

  sendZupassRequest(url);
}

async function addPODPCD(
  podContent: string,
  podPrivateKey: string,
  podFolder: string | undefined,
  redirectToFolder?: boolean
): Promise<void> {
  const newPOD = new PODPCD(
    uuid(),
    POD.sign(podEntriesFromJSON(JSON.parse(podContent)), podPrivateKey)
  );

  const serializedPODPCD = await PODPCDPackage.serialize(newPOD);

  const url = constructZupassPcdAddRequestUrl(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    serializedPODPCD,
    podFolder,
    false,
    redirectToFolder
  );

  if (redirectToFolder) {
    open(url);
  } else {
    sendZupassRequest(url);
  }
}

async function mintPODPCD(
  mintUrl: string,
  podContent: string,
  podPrivateKey: string,
  podFolder: string | undefined,
  redirectToFolder?: boolean
): Promise<void> {
  const newPOD = new PODPCD(
    uuid(),
    POD.sign(podEntriesFromJSON(JSON.parse(podContent)), podPrivateKey)
  );

  const serializedPODPCD = await PODPCDPackage.serialize(newPOD);

  const url = constructZupassPcdMintRequestUrl(
    ZUPASS_URL,
    mintUrl,
    window.location.origin + "#/popup",
    serializedPODPCD,
    podFolder,
    false,
    redirectToFolder
  );

  if (redirectToFolder) {
    open(url);
  } else {
    sendZupassRequest(url);
  }
}

async function addGPCPCD(
  podContent: string,
  podContent2: string,
  gpcConfig: string,
  membershipLists: string,
  podFolder: string | undefined
): Promise<void> {
  await GPCPCDPackage.init?.({
    zkArtifactPath: gpcArtifactDownloadURL(
      GPC_ARTIFACT_CONFIG.source as GPCArtifactSource,
      GPC_ARTIFACT_CONFIG.stability as GPCArtifactStability,
      GPC_ARTIFACT_CONFIG.version as GPCArtifactVersion,
      ZUPASS_URL
    )
  });

  const examplePODPCD = new PODPCD(
    uuid(),
    POD.sign(
      podEntriesFromJSON(JSON.parse(podContent)),
      EXAMPLE_EDDSA_PRIVATE_KEY
    )
  );

  const cardPODPCD = new PODPCD(
    uuid(),
    POD.sign(
      podEntriesFromJSON(JSON.parse(podContent2)),
      EXAMPLE_EDDSA_PRIVATE_KEY2
    )
  );

  const identityPCD = await SemaphoreIdentityPCDPackage.prove({
    identityV3: EXAMPLE_OWNER_IDENTITY
  });

  // Validate JSON input by parsing locally before sending.
  const jsonMembershipLists: JSONPODMembershipLists =
    JSON.parse(membershipLists);
  podMembershipListsFromJSON(jsonMembershipLists);
  const jsonProofConfig: JSONProofConfig = JSON.parse(gpcConfig);
  proofConfigFromJSON(jsonProofConfig);

  const proveArgs: GPCPCDArgs = {
    proofConfig: {
      argumentType: ArgumentTypeName.Object,
      value: jsonProofConfig
    },
    pods: {
      value: {
        examplePOD: {
          value: await PODPCDPackage.serialize(examplePODPCD),
          argumentType: ArgumentTypeName.PCD
        },
        cardPOD: {
          value: await PODPCDPackage.serialize(cardPODPCD),
          argumentType: ArgumentTypeName.PCD
        }
      },
      argumentType: ArgumentTypeName.RecordContainer
    },
    identity: {
      value: await SemaphoreIdentityPCDPackage.serialize(identityPCD),
      argumentType: ArgumentTypeName.PCD
    },
    externalNullifier: {
      value: "example nullifier",
      argumentType: ArgumentTypeName.Object
    },
    membershipLists: {
      value: jsonMembershipLists,
      argumentType: ArgumentTypeName.Object
    },
    watermark: {
      value: { cryptographic: 12345 },
      argumentType: ArgumentTypeName.Object
    },
    id: {
      argumentType: ArgumentTypeName.String,
      value: uuid()
    }
  };

  const newPCD = await GPCPCDPackage.prove(proveArgs);
  if (!(await GPCPCDPackage.verify(newPCD))) {
    throw new Error("New GPC does not verify!");
  }

  const serializedPCD = await GPCPCDPackage.serialize(newPCD);

  const url = constructZupassPcdAddRequestUrl(
    ZUPASS_URL,
    window.location.origin + "#/popup",
    serializedPCD,
    podFolder
  );

  sendZupassRequest(url);
}
