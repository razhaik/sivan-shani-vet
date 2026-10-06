import type { AggregatedClient } from "@/lib/clientAggregation";

export type ManagerBookingMode = "existing" | "new";

export interface ManagerCustomerDraft {
  name: string;
  phone: string;
  email: string;
  petName: string;
  petSpecies: string;
}

export interface ManagerBookingSuccess {
  id?: string;
  client_name: string;
  phone: string;
  email: string;
  pet_name: string;
  pet_species: string;
  appointment_type: string;
  date: string;
  start_time: string;
  end_time: string;
  notes: string;
  contactWarning: boolean;
  notificationWarning: boolean;
}

export type ClientSelectionHandler = (client: AggregatedClient) => void;
