/*
 * SPDX-FileCopyrightText: 2026 NikNikolaenkov/webui fork contributors
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { peopleApi, PeopleApiError } from './api';
import { PEOPLE_SECTION, PEOPLE_VIEWS } from './menu';

const ROOT = 'people-helper';

export const peopleKeys = {
  all: [ROOT] as const,
  people: [ROOT, 'people'] as const,
  person: (id: string) => [ROOT, 'person', id] as const,
  hr: (id: string) => [ROOT, 'hr', id] as const,
  units: [ROOT, 'units'] as const,
  lines: [ROOT, 'lines'] as const,
  audit: (id: string) => [ROOT, 'audit', id] as const,
  archive: [ROOT, 'archive'] as const,
};

/** Helper refusals (4xx) are answers, not glitches: no retries for them. */
const retry = (count: number, err: Error) =>
  count < 2 && !(err instanceof PeopleApiError && err.status >= 400 && err.status < 500);
const base = { retry, staleTime: 15_000 };

export const usePeople = () =>
  useQuery({ ...base, queryKey: peopleKeys.people, queryFn: ({ signal }) => peopleApi.listPeople(signal) });
export const usePerson = (id: string) =>
  useQuery({ ...base, queryKey: peopleKeys.person(id), queryFn: ({ signal }) => peopleApi.getPerson(id, signal) });
/** Only called for HR and admins (see shouldLoadHr); support never requests the HR card. */
export const useHrCard = (id: string, enabled: boolean) =>
  useQuery({
    ...base,
    queryKey: peopleKeys.hr(id),
    queryFn: ({ signal }) => peopleApi.getHr(id, signal),
    enabled,
    gcTime: 0,
  });
export const useUnits = () =>
  useQuery({ ...base, queryKey: peopleKeys.units, queryFn: ({ signal }) => peopleApi.listUnits(signal) });
export const useLines = () =>
  useQuery({ ...base, queryKey: peopleKeys.lines, queryFn: ({ signal }) => peopleApi.listLines(signal) });
export const useAudit = (id: string) =>
  useQuery({ ...base, queryKey: peopleKeys.audit(id), queryFn: ({ signal }) => peopleApi.audit(id, signal) });
export const useArchive = (enabled: boolean) =>
  useQuery({
    ...base,
    queryKey: peopleKeys.archive,
    queryFn: ({ signal }) => peopleApi.archive(signal),
    enabled,
    gcTime: 0,
  });

/** After any change: the registry is small, refetch what is on screen. */
export function useRefreshPeople() {
  const client = useQueryClient();
  return useCallback(() => client.invalidateQueries({ queryKey: peopleKeys.all }), [client]);
}

export const personPath = (cardId: string) => `/${PEOPLE_SECTION}/${PEOPLE_VIEWS.people}/${encodeURIComponent(cardId)}`;
export const sectionPath = (view: string) => `/${PEOPLE_SECTION}/${view}`;
