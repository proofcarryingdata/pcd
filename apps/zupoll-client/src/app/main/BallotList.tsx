import { CellContext, ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { DataTable } from "../../@/components/ui/DataTable";
import { Ballot } from "../../api/prismaTypes";
import { getTimeBeforeExpiry } from "./getTimeBeforeExpiry";

export const columns: ColumnDef<Ballot>[] = [
  {
    accessorKey: "ballotTitle",
    header: "Title"
  },
  {
    id: "expiry",
    header: "Expiry",
    cell: (cell: CellContext<Ballot, unknown>) => {
      const isExpired = new Date(cell.row.original.expiry) < new Date();
      return (
        <div style={{ fontStyle: isExpired ? "italic " : "initial" }}>
          {isExpired
            ? "Expired"
            : getTimeBeforeExpiry(cell.row.original.expiry)}
        </div>
      );
    }
  }
];

export function BallotList({ ballots }: { ballots: Ballot[] }) {
  const filteredBallots: Ballot[] = useMemo<Ballot[]>(() => {
    return ballots
      .map((ballot) => {
        return { ...ballot, isExpired: new Date(ballot.expiry) < new Date() };
      })
      .sort((a, b) => {
        // Check if either a or b is expired
        if (a.isExpired !== b.isExpired) {
          return +a.isExpired - +b.isExpired;
        }

        // If both have the same expired status, sort by creation date
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [ballots]);
  const router = useRouter();
  const onRowClick = useCallback(
    (ballot: Ballot) => {
      router.push(`ballot?id=${ballot.ballotURL}`);
    },
    [router]
  );

  return (
    <DataTable
      onRowClick={onRowClick}
      columns={columns}
      data={filteredBallots}
      placeholderText="No Ballots"
    />
  );
}
