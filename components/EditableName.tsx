"use client";

import { useState } from "react";
import { updateName } from "@/app/profile/[id]/actions";

export default function EditableName({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h1 className="heading text-3xl">{name}</h1>
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-neutral-400 hover:text-gold"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      action={updateName}
      onSubmit={() => setEditing(false)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        defaultValue={name}
        autoFocus
        required
        maxLength={80}
        className="rounded-md border border-charcoal-700 bg-charcoal-800 px-3 py-1.5 text-lg outline-none focus:border-gold"
      />
      <button
        type="submit"
        className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-charcoal"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-sm text-neutral-400 hover:text-white"
      >
        Cancel
      </button>
    </form>
  );
}
