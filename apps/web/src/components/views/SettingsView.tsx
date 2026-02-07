import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Loader2 } from "lucide-react";

export function SettingsView() {
  const { user, refreshUser } = useAuth();

  // Profile form state
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; email?: string }) =>
      api.updateProfile(data),
    onSuccess: async () => {
      await refreshUser();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.changePassword(data),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    },
  });

  const handleProfileSave = () => {
    const updates: { name?: string; email?: string } = {};
    if (name !== (user?.name ?? "")) updates.name = name;
    if (email !== (user?.email ?? "")) updates.email = email;
    if (Object.keys(updates).length === 0) return;
    profileMutation.mutate(updates);
  };

  const handlePasswordSave = () => {
    if (newPassword !== confirmPassword) return;
    if (newPassword.length < 8) return;
    passwordMutation.mutate({ currentPassword, newPassword });
  };

  const profileDirty =
    name !== (user?.name ?? "") || email !== (user?.email ?? "");

  const passwordValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {profileMutation.isError && (
            <p className="text-sm text-destructive">
              {profileMutation.error?.message || "Failed to update profile"}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleProfileSave}
              disabled={!profileDirty || profileMutation.isPending}
            >
              {profileMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
            {profileSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-sm text-destructive">
                Password must be at least 8 characters
              </p>
            )}
          </div>

          {passwordMutation.isError && (
            <p className="text-sm text-destructive">
              {passwordMutation.error?.message || "Failed to change password"}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handlePasswordSave}
              disabled={!passwordValid || passwordMutation.isPending}
            >
              {passwordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Update Password
            </Button>
            {passwordSuccess && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-4 w-4" />
                Password updated
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Learning Preferences</CardTitle>
          <CardDescription>Customize your learning experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">New words per story</p>
              <p className="text-sm text-muted-foreground">
                How many new words to introduce in each story
              </p>
            </div>
            <span className="text-muted-foreground">3-5 (default)</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Daily review goal</p>
              <p className="text-sm text-muted-foreground">
                Target number of reviews per day
              </p>
            </div>
            <span className="text-muted-foreground">20 (default)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
