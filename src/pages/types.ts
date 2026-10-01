import type { Dispatch, SetStateAction } from "react";
import type { PayrollData } from "../types";

export interface PageProps {
  data: PayrollData;
  setData: Dispatch<SetStateAction<PayrollData>>;
}
