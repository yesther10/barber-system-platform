import { selectionFromParams } from "@/lib/booking-state";
import { BookingFlow } from "./booking-flow";

interface BookingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Public booking page (booking design: URL state decision). Server component
 * that only translates search params into the selection and hands it to the
 * client step machine — every interaction replaces the URL, so a reload or a
 * login `next` handoff lands on the exact same step.
 */
export default async function BookingPage({ searchParams }: BookingPageProps) {
  const params = await searchParams;
  const selection = selectionFromParams(params);

  return <BookingFlow selection={selection} />;
}