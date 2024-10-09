import { Spacer } from "@pcd/passport-ui";
import { useRef, useState } from "react";
import { FaTrashCan } from "react-icons/fa6";
import { CenterColumn, TextCenter } from "../../components/core";
import { AppContainer } from "../../components/shared/AppContainer";
import { Accordion, AccordionRef } from "../shared/Accordion";
import { Avatar } from "../shared/Avatar";
import { Button2 } from "../shared/Button";
import { FloatingMenu } from "../shared/FloatingMenu";
import { Input2 } from "../shared/Input";
import { List } from "../shared/List";
import { NewModals } from "../shared/Modals/NewModals";
import { NewLoader } from "../shared/NewLoader";
import { Ticket } from "../shared/Ticket";
import { TicketCard } from "../shared/TicketCard";

const exampleList = [
  {
    title: "Event Passes",
    isLastItemBorder: false,
    children: [
      {
        title: "Devcon Pass",
        LeftIcon: <Avatar imgSrc="https://i.imgur.com/Fzs5N9T.jpeg" />
      },
      {
        title: "Berlin Event Pass",
        variant: "danger",
        LeftIcon: <FaTrashCan />
      },
      {
        title: "Denver Event Pass",
        variant: "danger",
        LeftIcon: <FaTrashCan />
      }
    ]
  },
  {
    title: "Puddle Crypto",
    children: [
      {
        title: "American Bullfrog",
        LeftIcon: (
          <Avatar
            imgSrc={`https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.nrdc.org%2Fsites%2Fdefault%2Ffiles%2Fstyles%2Fmedium_100%2Fpublic%2Fmedia-uploads%2F02_b3ewye_2400.jpg.jpg%3Fitok%3D4cywc1Uq&f=1&nofb=1&ipt=d994e52f175331180fca4072983909856868e3f3687df2475a18206a29a2b29b&ipo=images`}
          />
        )
      },
      {
        title: "Wood Frog",
        LeftIcon: (
          <Avatar
            imgSrc={`https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fmiro.medium.com%2Fv2%2Fresize%3Afit%3A1200%2F1*EKAWH3tIOEed1vSrzzhDpg.jpeg&f=1&nofb=1&ipt=af41ba48a56ef7af73a0f953d337053dfd6f0e69963763ef2eafd55d489b4b72&ipo=images`}
          />
        )
      }
    ]
  },
  {
    title: "FrogCraiglist",
    children: [
      {
        title: "Digital Chair Listing"
      }
    ]
  }
];

const ComponentsScreen = (): JSX.Element => {
  const [error, setError] = useState("");
  const accordionRef = useRef<AccordionRef>(null);
  return (
    <AppContainer bg="gray">
      {/* We need to reconsider the MaybeModal concept, not sure we will apply the same for bottom-modal */}
      <NewModals />
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          gap: 40,
          padding: 40
        }}
      >
        <FloatingMenu />
        <TextCenter>Hello, world!</TextCenter>
        <CenterColumn>
          <Input2 variant="secondary" placeholder="placeholder" error={error} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12
            }}
          >
            <Button2
              variant="danger"
              onClick={() => {
                if (error) {
                  setError("");
                } else {
                  setError("some generic error");
                }
              }}
            >
              test input{" "}
            </Button2>
            <Button2 variant="secondary">secondary</Button2>
          </div>
          <div>
            <NewLoader columns={5} rows={3} />
            <Avatar imgSrc={"https://i.imgur.com/Fzs5N9T.jpeg"} />
          </div>
          <div
            style={{
              margin: 12
            }}
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 40,
                width: 370,
                height: 630
              }}
            >
              <List list={exampleList} />
            </div>
            <Spacer h={12} />
            <div
              style={{
                background: "#fff",
                borderRadius: 40,
                width: 370,
                height: 630,
                padding: 12,
                position: "relative"
              }}
            >
              <Accordion
                ref={accordionRef}
                title="revealed information"
                children={[
                  {
                    title: "AttendeeEmail"
                  },
                  {
                    title: "AttendeeName",
                    onClick(): void {
                      console.log("Example onclick accordion item");
                    }
                  },
                  {
                    title: "EventID"
                  },
                  {
                    title: "Product ID"
                  },
                  {
                    title: "AttendeeSemaphoreId"
                  }
                ]}
              />
              <Button2
                style={{ position: "absolute", bottom: 20, maxWidth: 344 }}
                onClick={() => {
                  accordionRef.current?.toggle();
                }}
              >
                Click to toggle accordion
              </Button2>
            </div>
          </div>
        </CenterColumn>
        <div style={{ display: "flex", flexDirection: "row", gap: 40 }}>
          <TicketCard
            title="DEVCON 2025"
            address="Bangkok, Thailand"
            ticketCount={3}
            cardColor="purple"
            imgSource="https://i.imgur.com/Fzs5N9T.jpeg"
            ticketDate="NOV. 12-15, 2024"
          />
          <TicketCard
            title="ETH Denver 2024"
            address="Denver, Colorado"
            ticketCount={1}
            cardColor="orange"
            imgSource="https://i.imgur.com/Fzs5N9T.jpeg"
            ticketDate="AUG. 13, 2022"
          />
        </div>
        <Ticket name="Richard Lu" type="Speaker" email="richard@0xparg.org" />
      </div>
    </AppContainer>
  );
};

export default ComponentsScreen;
