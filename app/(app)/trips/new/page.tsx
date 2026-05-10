"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES } from "@/lib/currency";
import { createGroup } from "@/lib/firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { handleError } from "@/lib/errors/handle-error";

export default function NewTripPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast({ title: "Trip name is required", variant: "destructive" });
      return;
    }
    try {
      setSubmitting(true);
      const id = await createGroup({
        name,
        description,
        imageURL: imageURL.trim() || null,
        currency,
        creator: {
          uid: user.uid,
          name: user.name,
          email: user.email,
          photoURL: user.photoURL,
          role: "admin",
        },
      });
      toast({ title: "Trip created", description: `Welcome to ${name}!`, variant: "success" });
      router.replace(`/trips/${id}`);
    } catch (e) {
      handleError(e, {
        domain: "group",
        toastTitle: "Couldn't create trip",
        context: { name },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New trip</h1>
        <p className="text-sm text-muted-foreground">
          Set up a group to start tracking shared expenses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trip details</CardTitle>
          <CardDescription>
            You can change these later from the trip settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Trip name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Goa 2026"
                required
                maxLength={64}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Long weekend with the gang"
                maxLength={200}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Pick currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.symbol} {c.code} — {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="image">Cover image URL (optional)</Label>
                <Input
                  id="image"
                  type="url"
                  value={imageURL}
                  onChange={(e) => setImageURL(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Create trip
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
