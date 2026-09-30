'use client';
import { CachedScreen } from '../cached-screen';
import { DashboardClient } from '../admin/dashboard-client';
import { TemplatesClient } from '../admin/templates-client';
import { PeopleClient } from '../admin/people-client';
import type { ScreenData } from '@/lib/screen-data';
type Initial<K extends 'dashboard'|'templates'|'people'> = {data:ScreenData<K>;updatedAt:number};
export function CachedDashboard({initial,ownerName}: {initial?:Initial<'dashboard'>;ownerName:string}) {return <CachedScreen screen="dashboard" initial={initial}>{data=><DashboardClient {...data} ownerName={ownerName}/>}</CachedScreen>;}
export function CachedTemplates({initial}: {initial?:Initial<'templates'>}) {return <CachedScreen screen="templates" initial={initial}>{templates=><TemplatesClient templates={templates}/>}</CachedScreen>;}
export function CachedPeople({initial,search,page}: {initial?:Initial<'people'>;search:string;page:number}) {return <CachedScreen screen="people" args={[search,String(page)]} initial={initial}>{data=><PeopleClient people={data.rows} total={data.total} search={search} page={page}/>}</CachedScreen>;}
