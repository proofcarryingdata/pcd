import { Spacer } from "@pcd/passport-ui";
import { ReactNode, useState } from "react";
import { NewButton } from "../../NewButton";
import { H1, Placeholder, ZuLogo } from "../../core";
import { MaybeModal } from "../../modals/Modal";
import { AppContainer } from "../../shared/AppContainer";

const Notes = [
  {
    title: "Levelled Fully Homomorphic Encryption from Learning with Errors",
    url: "https://notes.0xparc.org/notes/levelled-fhe-from-lwe"
  },
  {
    title: "Public-key Cryptography from Learning with Errors",
    url: "https://notes.0xparc.org/notes/public-key-cryptography-from-lwe"
  },
  {
    title: "PCP -- Probabilistically Checkable Proofs",
    url: "https://notes.0xparc.org/notes/pcp-overview"
  },
  {
    title: "The sum-check protocol",
    url: "https://notes.0xparc.org/notes/sum-check"
  },
  {
    title: "Low-degree testing",
    url: "https://notes.0xparc.org/notes/low-degree-testing"
  },
  { title: "Quad-SAT", url: "https://notes.0xparc.org/notes/quad-sat" },
  {
    title: "PCP -- A Toy Protocol",
    url: "https://notes.0xparc.org/notes/toy-pcp"
  },
  {
    title:
      "Reducing the number of phone books in PCP (smart random linear combinations)",
    url: "https://notes.0xparc.org/notes/pcp-linear-combination"
  },
  {
    title: "(DRAFT) Garbled Circuits for Three-Party Computation",
    url: "https://notes.0xparc.org/notes/garbled-circuits-three-party"
  },
  {
    title: "[DRAFT] Garbled Circuits: Commutative Encryption Protocol",
    url: "https://notes.0xparc.org/notes/garbled-circuits-commutative-encryption"
  },
  {
    title: "Motivating Garbled Circuits",
    url: "https://notes.0xparc.org/notes/motivating-garbled-circuits"
  }
];

const BlogPosts = [
  {
    title: "ZK Hunt: an exploration into the unknown",
    url: "https://0xparc.org/blog/zk-hunt"
  },
  {
    title: "Introducing the Autonomous Worlds Network",
    url: "https://0xparc.org/blog/autonomous-worlds-network"
  },
  {
    title: "[Community] Announcing Index Supply",
    url: "https://github.com/orgs/indexsupply/discussions/125"
  },
  {
    title: "Autonomous Worlds Hackathon",
    url: "https://0xparc.org/blog/autonomous-worlds-hackathon"
  },
  {
    title: "Apply for the ZK Spring Residency in Vietnam",
    url: "https://0xparc.org/blog/2023-spring-residency"
  },
  {
    title:
      "Apply for PARC Squad: Proof Aggregation, Recursion, and Composition",
    url: "https://0xparc.org/blog/parc-squad"
  },
  {
    title: "Recursive zkSNARKs: Exploring New Territory",
    url: "https://0xparc.org/blog/groth16-recursion"
  },
  {
    title: "[Community] Announcing Succinct Labs",
    url: "https://blog.succinct.xyz/post/2022/09/20/proof-of-consensus/"
  },
  {
    title: "[Community] Announcing Personae Labs",
    url: "https://personae-labs.notion.site/Personae-Labs-d46a90c64953416eb386a0ae2ee7679b"
  },
  {
    title: "[Community] ETHdos",
    url: "https://ethdos.xyz/blog"
  }
];

export function ParcScreen(): ReactNode {
  const [isBlog, setIsBlog] = useState(true);

  return (
    <>
      <MaybeModal />
      <AppContainer bg="gray">
        <Spacer h={24} />
        <div className="flex-row flex align-center items-center gap-3">
          <ZuLogo width="48px" /> <H1 className="">Zupass</H1>
        </div>
        <Spacer h={24} />
        <Placeholder minH={540}>
          <div className="flex flex-col gap-2">
            <NewButton
              onClick={() => {
                window.location.href = "#/more";
              }}
            >
              Back
            </NewButton>
            <div className="flex flex-row gap-2">
              <NewButton className="flex-grow" onClick={() => setIsBlog(true)}>
                Blog
              </NewButton>
              <NewButton className="flex-grow" onClick={() => setIsBlog(false)}>
                Notes
              </NewButton>
            </div>
            {(isBlog ? BlogPosts : Notes).map((post, i) => (
              <NewButton
                variant="blackWhite"
                className="overflow-hidden text-ellipsis whitespace-nowrap justify-start text-left"
                key={i}
                onClick={() => window.open(post.url, "_blank")}
              >
                {post.title}
              </NewButton>
            ))}
          </div>
        </Placeholder>
        <Spacer h={24} />
      </AppContainer>
    </>
  );
}