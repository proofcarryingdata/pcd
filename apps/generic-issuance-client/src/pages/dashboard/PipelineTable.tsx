import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Link,
  Table,
  TableContainer,
  Td,
  Th,
  Thead,
  Tr
} from "@chakra-ui/react";
import {
  GenericIssuancePipelineListEntry,
  PipelineType
} from "@pcd/passport-interface";
import {
  ColumnDef,
  SortingState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from "@tanstack/react-table";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link as ReactLink } from "react-router-dom";
import styled from "styled-components";
import {
  PipelineStatusTag,
  PipelineTypeTag,
  pipelineCreatedAtStr,
  pipelineDisplayNameStr,
  pipelineLastEditStr,
  pipelineLastLoadStr
} from "../../components/PipelineDisplayUtils";
import {
  getAllHoneycombLinkForPipeline,
  getLoadTraceHoneycombLinkForPipeline
} from "../../helpers/util";

export type PipelineStateDisplay = "starting" | "loaded" | "error" | "paused";

export type PipelineRow = {
  status: "error" | "loaded" | "starting" | "paused";
  type: PipelineType;
  owner: string;
  timeCreated: string;
  timeUpdated: string;
  id: string;
  loadTraceLink: string;
  allTraceLink: string;
  lastLoad?: string;
  name?: string;
  displayName: string;
};

export function PipelineTable({
  entries,
  isAdminView,
  singleRowMode
}: {
  entries: GenericIssuancePipelineListEntry[];
  isAdminView: boolean;
  singleRowMode?: boolean;
}): ReactNode {
  const entryToRow = useCallback(
    (entry: GenericIssuancePipelineListEntry): PipelineRow => {
      return {
        status: entry.pipeline.options?.paused
          ? "paused"
          : !entry.extraInfo.lastLoad
          ? "starting"
          : entry.extraInfo.lastLoad?.success
          ? "loaded"
          : "error",
        type: entry.pipeline.type,
        owner: entry.extraInfo.ownerEmail,
        timeCreated: entry.pipeline.timeCreated,
        timeUpdated: entry.pipeline.timeUpdated,
        id: entry.pipeline.id,
        loadTraceLink: getLoadTraceHoneycombLinkForPipeline(entry.pipeline.id),
        allTraceLink: getAllHoneycombLinkForPipeline(entry.pipeline.id),
        lastLoad: entry.extraInfo.lastLoad?.lastRunEndTimestamp,
        name: entry.pipeline.options?.name,
        displayName: pipelineDisplayNameStr(entry.pipeline)
      };
    },
    []
  );

  const rows: PipelineRow[] = useMemo(() => {
    return entries.map(entryToRow);
  }, [entryToRow, entries]);

  const columnHelper = createColumnHelper<PipelineRow>();
  const columns: Array<ColumnDef<PipelineRow> | undefined> = useMemo(
    () => [
      columnHelper.accessor("displayName", {
        header: "name",
        cell: (table) => table.row.original.displayName
      }),
      columnHelper.accessor("timeUpdated", {
        header: "edited",
        cell: (props) => pipelineLastEditStr(props.row.original.timeUpdated)
      }),
      columnHelper.accessor("timeCreated", {
        header: "created",
        cell: (props) => pipelineCreatedAtStr(props.row.original.timeCreated)
      }),
      columnHelper.accessor("lastLoad", {
        header: "Last Load",
        cell: (props) => pipelineLastLoadStr(props.row.original.lastLoad)
      }),
      isAdminView
        ? columnHelper.accessor("owner", {
            header: "Owner",
            cell: (props) => props.row.original.owner
          })
        : undefined,

      columnHelper.accessor("type", {
        header: "type",
        cell: (props) => <PipelineTypeTag type={props.row.original.type} />
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (props) => (
          <PipelineStatusTag status={props.row.original.status} />
        )
      }),
      isAdminView
        ? columnHelper.accessor("loadTraceLink", {
            enableSorting: false,
            header: "load",
            cell: (table) => (
              <Link
                as={ReactLink}
                href={table.row.original.loadTraceLink}
                isExternal={true}
              >
                load
                <ExternalLinkIcon mx="2px" />
              </Link>
            )
          })
        : undefined,
      isAdminView
        ? columnHelper.accessor("allTraceLink", {
            enableSorting: false,
            header: "all",
            cell: (table) => (
              <Link
                as={ReactLink}
                href={table.row.original.allTraceLink}
                isExternal={true}
              >
                all
                <ExternalLinkIcon mx="2px" />
              </Link>
            )
          })
        : undefined
    ],
    [columnHelper, isAdminView, singleRowMode]
  );
  const filteredColumns = useMemo(() => {
    return columns.filter((r) => !!r) as Array<ColumnDef<PipelineRow>>;
  }, [columns]);
  const [sorting, setSorting] = useState<SortingState>(
    singleRowMode
      ? []
      : [
          {
            id: "timeUpdated",
            desc: true
          }
        ]
  );

  useEffect(() => {
    console.log("sorting", sorting);
  }, [sorting]);

  const table = useReactTable({
    columns: filteredColumns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting
    },
    onSortingChange: singleRowMode ? undefined : setSorting
  });

  return (
    <TableContainer>
      <Table variant="simple" size="sm">
        <Thead style={{ userSelect: "none" }}>
          {table.getHeaderGroups().map((headerGroup) => (
            <Tr key={headerGroup.id}>
              {headerGroup.headers.map((header, i) => {
                return (
                  <Th
                    style={{ width: i === 0 ? "auto" : "1%" }}
                    key={header.id + "" + i}
                    colSpan={header.colSpan}
                  >
                    {header.isPlaceholder ? null : (
                      <span
                        {...{
                          style: header.column.getCanSort()
                            ? {
                                cursor: "pointer"
                              }
                            : undefined,

                          onClick: header.column.getToggleSortingHandler()
                        }}
                      >
                        <span
                          style={{
                            fontWeight: header.column.getIsSorted()
                              ? "bold"
                              : "normal",
                            fontFamily: "Inconsolata",
                            fontSize: "12pt"
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </span>
                      </span>
                    )}
                  </Th>
                );
              })}
            </Tr>
          ))}
        </Thead>
        <TBody>
          {table.getRowModel().rows.map((row, i) => {
            return (
              <Tr key={row.id + "" + i}>
                {row.getVisibleCells().map((cell, j) => {
                  return (
                    <Td key={cell.id + "" + j}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </Td>
                  );
                })}
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
}

const TBody = styled.tbody`
  tr {
    user-select: none;
    cursor: pointer;
    transition: background-color 150ms;

    &:hover {
      background-color: rgba(0, 0, 0, 0.07);

      &:active {
        background-color: rgba(0, 0, 0, 0.1);
      }
    }
  }
`;
