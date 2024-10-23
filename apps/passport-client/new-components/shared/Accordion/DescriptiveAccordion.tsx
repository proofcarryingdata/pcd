import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import styled from "styled-components";
import { Typography } from "../Typography";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/16/solid";

export type DescriptiveAccrodionChild = {
  title: string;
  key?: string;
  description: string;
};

export type DescriptiveAccordionProps = {
  title: string;
  children: DescriptiveAccrodionChild[];
};

export type DescriptiveAccordionRef = {
  open: (index: number) => void;
  close: (index: number) => void;
  toggle: (index: number) => void;
};

const Container = styled.div`
  border-top: 1.15px solid #eceaf4;
  border-left: 1.15px solid #eceaf4;
  border-right: 1.15px solid #eceaf4;
  background: #f6f8fd;
  border-radius: 10px;
`;
const HeaderContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  color: var(--text-tertiary);
  border-bottom: 1.15px solid #eceaf4;
  cursor: pointer;
`;

const DescriptiveAccordionItem = styled.div<{
  lastItem: boolean;
  open: boolean;
}>`
  padding: 12px 16px;
  color: var(--text-primary);
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
  ${({ lastItem }): string | undefined =>
    !lastItem ? "border-bottom: 1.15px solid #eceaf4;" : undefined}
`;

const ItemContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 90%;
`;

export const DescriptiveAccordion = forwardRef<
  DescriptiveAccordionRef,
  DescriptiveAccordionProps
>(({ title, children }, ref) => {
  const [open, setOpen] = useState<boolean[]>(children.map(() => false));

  useImperativeHandle(ref, () => {
    return {
      open(index: number): void {
        setOpen((old) => {
          const updated = [...old];
          updated[index] = true;
          return updated;
        });
      },
      close(index: number): void {
        setOpen((old) => {
          const updated = [...old];
          updated[index] = false;
          return updated;
        });
      },
      toggle(index: number): void {
        setOpen((old) => {
          const updated = [...old];
          updated[index] = !old[index];
          return updated;
        });
      }
    };
  });

  const renderedChildren = useMemo(() => {
    const len = children.length;
    return (
      <ItemContainer>
        {children.map((child, i) => {
          const isLast = len - 1 === i;
          return (
            <DescriptiveAccordionItem
              open={open[i]}
              key={child.key}
              lastItem={isLast}
              onClick={() =>
                setOpen((old) => {
                  const updated = [...old];
                  updated[i] = !old[i];
                  return updated;
                })
              }
            >
              {open[i] && (
                <ChevronDownIcon
                  color="var(--text-tertiary)"
                  width={20}
                  height={20}
                />
              )}
              {!open[i] && (
                <ChevronRightIcon
                  color="var(--text-tertiary)"
                  width={20}
                  height={20}
                />
              )}
              <ContentContainer>
                <Typography fontSize={14} fontWeight={500} family="Rubik">
                  {child.title}
                </Typography>
                {open[i] && (
                  <Typography fontSize={14} family="Rubik">
                    {child.description}
                  </Typography>
                )}
              </ContentContainer>
            </DescriptiveAccordionItem>
          );
        })}
      </ItemContainer>
    );
  }, [children, open]);
  return (
    <Container>
      <HeaderContainer>
        <Typography fontWeight={700} color="var(--text-tertiary)" fontSize={14}>
          {title.toUpperCase()}
        </Typography>
      </HeaderContainer>
      {open && renderedChildren}
    </Container>
  );
});
