import { ReactNode, useCallback, useEffect, useState } from "react";
// eslint-disable-next-line import/no-named-as-default
import { Button, VStack } from "@chakra-ui/react";
import { stringify } from "csv-stringify/sync";
import { Matrix, Mode, Spreadsheet } from "react-spreadsheet";
import styled from "styled-components";
import { parseCSV } from "./parseCSV";

export function CSVSheetPreview({
  csv,
  onChange
}: {
  csv: string;
  onChange?: (newCsv: string) => void;
}): ReactNode {
  const [parsed, setParsed] = useState<string[][]>([]);
  const [parseError, setParseError] = useState<Error>();

  useEffect(() => {
    parseCSV(csv)
      .then((parsed) => {
        setParsed(parsed);
        setParseError(undefined);
        const copy = [...parsed];
        copy.shift();
        setData(copy.map((row) => row.map((value) => ({ value }))));
      })
      .catch((e) => {
        setParsed([]);
        setParseError(e);
      });
  }, [csv]);

  const [data, setData] = useState<Matrix<{ value: string }>>([]);

  const [updateTimeout, setUpdateTimeout] = useState<
    NodeJS.Timeout | undefined
  >(undefined);

  const doUpdate = useCallback(
    (data: Matrix<{ value: string }>) => {
      // commit data
      if (onChange) {
        const filteredData = data.filter((row) => {
          return !row.every(
            (cell) => cell === undefined || cell.value === undefined
          );
        });
        if (filteredData.length === 0) {
          filteredData.push(parsed[0].map(() => ({ value: "" })));
        }
        const newCsv = stringify(
          // This is ugly but is necessary to ensure that the header row
          // does not get lost. The data in the table does not include
          // this row, so we have to manually include it from the initial
          // parse of the CSV file.
          [
            parsed[0],
            ...filteredData.map((row) => row.map((cell) => cell?.value ?? ""))
          ]
        );
        if (newCsv !== csv) {
          onChange(newCsv);
        }
      }
      clearTimeout(updateTimeout);
      setUpdateTimeout(undefined);
    },
    [csv, onChange, parsed, updateTimeout]
  );

  const addRow = useCallback(() => {
    if (onChange) {
      const newCsv = stringify([...parsed, parsed[0].map(() => "")]);
      onChange(newCsv);
    }
  }, [onChange, parsed]);

  const addColumn = useCallback(() => {
    if (onChange) {
      const name = prompt("Enter the name for the new column", "newColumn");
      if (!name) {
        return;
      }
      const newCsv = stringify(
        parsed.map((row, index) => {
          return [...row, index === 0 ? name : ""];
        })
      );
      onChange(newCsv);
    }
  }, [onChange, parsed]);

  if (parseError) {
    return <Container>{parseError.message}</Container>;
  }

  return (
    <Container>
      <Spreadsheet
        onModeChange={(mode: Mode) => {
          if (mode === "view") {
            doUpdate(data);
          }
        }}
        onChange={(data): void => {
          doUpdate(data);
        }}
        darkMode={true}
        data={data}
        columnLabels={parsed[0]}
        className={"sheet"}
      />
      <VStack spacing={2} alignItems={"start"}>
        <Button onClick={addRow} colorScheme="blue">
          Add row
        </Button>
        <Button onClick={addColumn} colorScheme="blue">
          Add column
        </Button>
      </VStack>
    </Container>
  );
}

const clr = `rgba(47,55,70,1)`;

const Container = styled.div`
  padding: 16px 0px;
  border-radius: 4px;
  box-sizing: border-box;
  overflow: hidden;
  overflow-y: scroll;
  overflow-x: scroll;
  text-align: left;
  height: 100%;
  width: 100%;

  .sheet {
    background-color: ${clr};

    table {
      .Spreadsheet__header {
        min-width: 3em;
      }

      .Spreadsheet__data-viewer {
        padding: 0px;
        white-space: normal;
        word-break: normal;
      }

      td {
        padding: 8px;
      }
    }
  }
`;
