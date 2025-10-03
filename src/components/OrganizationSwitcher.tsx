import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const OrganizationSwitcher = () => {
  const { data: profile } = useQuery({
    queryKey: ["profile-org"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from("profiles")
        .select("organization_id, organizations(name)")
        .eq("id", user.id)
        .maybeSingle();

      return data;
    },
  });

  if (!profile?.organizations) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={profile.organization_id || ""} disabled>
        <SelectTrigger className="h-8 w-full">
          <SelectValue>
            {(profile.organizations as any)?.name || "No Organization"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={profile.organization_id || ""}>
            {(profile.organizations as any)?.name || "No Organization"}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
