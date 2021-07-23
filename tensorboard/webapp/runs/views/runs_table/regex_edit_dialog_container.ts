/* Copyright 2020 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/
import {Component, Inject} from '@angular/core';
import {MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import {Store} from '@ngrx/store';
import {combineLatest, defer, merge, Observable, Subject} from 'rxjs';
import {
  combineLatestWith,
  debounceTime,
  startWith,
  take,
  map,
} from 'rxjs/operators';

import {State} from '../../../app_state';
import {CHART_COLOR_PALLETE} from '../../../util/colors';
import {runGroupByChanged} from '../../actions';
import {
  getColorGroupRegexString,
  getRunIdsForExperiment,
  getRuns,
} from '../../store/runs_selectors';
import {groupRuns} from '../../store/utils';
import {Run, GroupByKey} from '../../types';
import {ColorGroup} from './regex_edit_dialog_component';

const INPUT_CHANGE_DEBOUNCE_INTERVAL_MS = 500;

@Component({
  selector: 'regex-edit-dialog',
  template: `<regex-edit-dialog-component
    [regexString]="groupByRegexString$ | async"
    [colorRunPairList]="colorRunPairList$ | async"
    (onSave)="onSave($event)"
    (regexInputOnChange)="onRegexInputOnChange($event)"
  ></regex-edit-dialog-component>`,
})
export class RegexEditDialogContainer {
  private readonly experimentIds: string[];
  private readonly runIdToEid$: Observable<Record<string, string>>;
  private readonly allRuns$: Observable<Run[]>;
  private readonly tentativeRegexString$: Subject<string> = new Subject<
    string
  >();

  readonly groupByRegexString$: Observable<string> = defer(() => {
    return merge(
      this.store.select(getColorGroupRegexString).pipe(take(1)),
      this.tentativeRegexString$
    );
  }).pipe(startWith(''));

  readonly colorRunPairList$: Observable<ColorGroup[]> = defer(() => {
    return this.groupByRegexString$.pipe(
      debounceTime(INPUT_CHANGE_DEBOUNCE_INTERVAL_MS),
      combineLatestWith(this.allRuns$, this.runIdToEid$),
      map(([regexString, allRuns, runIdToEid]) => {
        const groupBy = {
          key: GroupByKey.REGEX,
          regexString,
        };
        const groups = groupRuns(groupBy, allRuns, runIdToEid);
        const groupKeyToColorString = new Map<string, string>();
        const colorRunPairList: ColorGroup[] = [];

        Object.entries(groups.matches).forEach(([groupId, runs]) => {
          const color =
            groupKeyToColorString.get(groupId) ??
            CHART_COLOR_PALLETE[
              groupKeyToColorString.size % CHART_COLOR_PALLETE.length
            ];
          groupKeyToColorString.set(groupId, color);
          colorRunPairList.push({groupId, color, runs});
        });
        return colorRunPairList;
      })
    );
  }).pipe(startWith([]));

  constructor(
    private readonly store: Store<State>,
    public dialogRef: MatDialogRef<RegexEditDialogContainer>,
    @Inject(MAT_DIALOG_DATA) data: {experimentIds: string[]}
  ) {
    this.experimentIds = data.experimentIds;

    this.runIdToEid$ = combineLatest(
      this.experimentIds.map((experimentId) => {
        return this.store
          .select(getRunIdsForExperiment, {experimentId})
          .pipe(map((runIds) => ({experimentId, runIds})));
      })
    ).pipe(
      map((runIdsAndExpIdList) => {
        const runIdToEid: Record<string, string> = {};
        for (const {runIds, experimentId} of runIdsAndExpIdList) {
          for (const runId of runIds) {
            runIdToEid[runId] = experimentId;
          }
        }
        return runIdToEid;
      })
    );

    this.allRuns$ = combineLatest(
      this.experimentIds.map((experimentId) => {
        return this.store.select(getRuns, {experimentId});
      })
    ).pipe(
      map((runsList) => {
        return runsList.flat();
      })
    );
  }

  onRegexInputOnChange(regexString: string) {
    this.tentativeRegexString$.next(regexString);
  }

  onSave(regexString: string): void {
    this.store.dispatch(
      runGroupByChanged({
        experimentIds: this.experimentIds,
        groupBy: {key: GroupByKey.REGEX, regexString: regexString},
      })
    );
  }
}

export const TEST_ONLY = {
  INPUT_CHANGE_DEBOUNCE_INTERVAL_MS,
};