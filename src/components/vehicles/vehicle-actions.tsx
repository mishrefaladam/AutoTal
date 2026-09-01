"use client";

import { useState } from "react";
import { CalendarClock, MessageSquareText } from "lucide-react";

import { TestDriveForm } from "@/components/forms/test-drive-form";
import { VehicleInquiryForm } from "@/components/forms/vehicle-inquiry-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Die beiden Formular-CTAs der Fahrzeugdetailseite (US-08, US-09).
 *
 * Die Formulare liegen in Dialogen, damit die Detailseite nicht von zwei
 * langen Formularen dominiert wird. Der Dialog scrollt intern – auf dem
 * Smartphone bleibt der Absenden-Button dadurch immer erreichbar.
 */
export function VehicleActions({
  vehicleSlug,
  vehicleTitle,
}: {
  vehicleSlug: string;
  vehicleTitle: string;
}) {
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [testDriveOpen, setTestDriveOpen] = useState(false);

  return (
    <>
      <Button
        variant="brand"
        size="2xl"
        className="w-full"
        onClick={() => setInquiryOpen(true)}
      >
        <MessageSquareText data-icon="inline-start" aria-hidden="true" />
        Fahrzeug anfragen
      </Button>

      <Button
        variant="outline"
        size="2xl"
        className="w-full"
        onClick={() => setTestDriveOpen(true)}
      >
        <CalendarClock data-icon="inline-start" aria-hidden="true" />
        Probefahrt vereinbaren
      </Button>

      <Dialog open={inquiryOpen} onOpenChange={setInquiryOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fahrzeug anfragen</DialogTitle>
            <DialogDescription>{vehicleTitle}</DialogDescription>
          </DialogHeader>

          <VehicleInquiryForm
            vehicleSlug={vehicleSlug}
            vehicleTitle={vehicleTitle}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={testDriveOpen} onOpenChange={setTestDriveOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Probefahrt vereinbaren</DialogTitle>
            <DialogDescription>{vehicleTitle}</DialogDescription>
          </DialogHeader>

          <TestDriveForm vehicleSlug={vehicleSlug} />
        </DialogContent>
      </Dialog>
    </>
  );
}
