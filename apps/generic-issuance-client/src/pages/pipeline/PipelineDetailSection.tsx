import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Accordion,
  AccordionButton,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Card,
  ListItem,
  UnorderedList
} from "@chakra-ui/react";
import {
  PipelineDefinition,
  PipelineInfoResponseValue
} from "@pcd/passport-interface";
import { ReactNode } from "react";
import { PodLink } from "../../components/Core";
import { LastLoaded } from "../../components/LastLoaded";
import {
  getAllHoneycombLinkForPipeline,
  getHoneycombQueryDurationStr,
  getLoadTraceHoneycombLinkForPipeline
} from "../../helpers/util";
import { PipelineLatestDataSection } from "./PipelineLatestDataSection";
import { PipelineLatestLogsSection } from "./PipelineLatestLogsSection";

export function PipelineDetailSection({
  pipelineInfo,
  pipelineFromServer,
  isAdminView
}: {
  pipelineInfo: PipelineInfoResponseValue;
  pipelineFromServer: PipelineDefinition;
  isAdminView: boolean;
}): ReactNode {
  return (
    <>
      <Card padding={4} mb={4}>
        {pipelineInfo.feeds &&
          pipelineInfo.feeds.map((feed, i) => (
            <Box key={feed.url} mb={i === 0 ? 0 : 2}>
              <PodLink
                hideIcon
                isExternal
                to={`${
                  process.env.PASSPORT_CLIENT_URL
                }/#/add-subscription?url=${encodeURIComponent(feed.url)}`}
              >
                <Button colorScheme="green">
                  <Box mr={2}>{feed.name} Feed for Zupass</Box>{" "}
                  <ExternalLinkIcon mx="2px" />
                </Button>
              </PodLink>
              <Box ml={4} display="inline-block"></Box>
              {isAdminView && (
                <PodLink to={feed.url} isExternal={true}>
                  Feed Link
                </PodLink>
              )}
            </Box>
          ))}
      </Card>
      <Accordion defaultIndex={[]} allowMultiple={true}>
        <AccordionItem>
          <AccordionButton>Latest Logs</AccordionButton>
          <AccordionPanel>
            <PipelineLatestLogsSection lastLoad={pipelineInfo.lastLoad} />
          </AccordionPanel>
        </AccordionItem>

        <AccordionItem>
          <AccordionButton>Latest Data</AccordionButton>
          <AccordionPanel>
            <PipelineLatestDataSection latestAtoms={pipelineInfo.latestAtoms} />
          </AccordionPanel>
        </AccordionItem>

        {isAdminView && (
          <AccordionItem>
            <AccordionButton>
              Tracing Links&nbsp;<Badge colorScheme="gray">Admin</Badge>
            </AccordionButton>
            <AccordionPanel>
              <UnorderedList>
                <ListItem>
                  <PodLink
                    isExternal={true}
                    to={getLoadTraceHoneycombLinkForPipeline(
                      pipelineFromServer.id
                    )}
                  >
                    data load traces {getHoneycombQueryDurationStr()}
                  </PodLink>
                </ListItem>
                <li>
                  <PodLink
                    isExternal={true}
                    to={getAllHoneycombLinkForPipeline(pipelineFromServer.id)}
                  >
                    all traces related to this pipeline{" "}
                    {getHoneycombQueryDurationStr()}
                  </PodLink>
                </li>
              </UnorderedList>
            </AccordionPanel>
          </AccordionItem>
        )}
      </Accordion>

      <LastLoaded />
    </>
  );
}
