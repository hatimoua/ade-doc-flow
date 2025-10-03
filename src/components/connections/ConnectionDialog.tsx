import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WebhookForm } from "./WebhookForm";
import { CsvForm } from "./CsvForm";
import { OAuthForm } from "./OAuthForm";
import { TokenForm } from "./TokenForm";

type Adapter = {
  id: string;
  name: string;
  description: string;
  icon: string;
  type: "oauth" | "token" | "webhook" | "csv";
};

type Connection = {
  id: string;
  adapter: string;
  status: string;
  display_name: string;
  is_default: boolean;
  last_validated_at: string | null;
  meta: any;
};

type ConnectionDialogProps = {
  adapter: Adapter;
  connection: Connection | null;
  onClose: () => void;
  onSuccess: () => void;
};

export const ConnectionDialog = ({
  adapter,
  connection,
  onClose,
  onSuccess,
}: ConnectionDialogProps) => {
  const [open, setOpen] = useState(true);

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 300);
  };

  const handleSuccess = () => {
    onSuccess();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{adapter.icon}</span>
            {connection ? `Edit ${adapter.name}` : `Connect ${adapter.name}`}
          </DialogTitle>
          <DialogDescription>{adapter.description}</DialogDescription>
        </DialogHeader>

        {adapter.type === "webhook" && (
          <WebhookForm
            connection={connection}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        )}

        {adapter.type === "csv" && (
          <CsvForm
            connection={connection}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        )}

        {adapter.type === "oauth" && (
          <OAuthForm
            adapter={adapter}
            connection={connection}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        )}

        {adapter.type === "token" && adapter.id === "netsuite" && (
          <TokenForm
            connection={connection}
            onSuccess={handleSuccess}
            onCancel={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
