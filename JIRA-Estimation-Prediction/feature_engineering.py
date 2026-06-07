import pandas as pd
import numpy as np
from load_data import load_iteration_files, load_issue_files

def build_issue_features(issue_df):
    agg = issue_df.groupby(['boardid', 'sprintid', 'org', 'snapshot']).agg(
        total_issues=('type', 'count'),
        avg_blocking=('no_blocking', 'mean'),
        avg_blockedby=('no_blockedby', 'mean'),
        total_blocking=('no_blocking', 'sum'),
        total_blockedby=('no_blockedby', 'sum'),
        avg_priority_change=('no_priority_change', 'mean'),
        avg_issuelink=('no_issuelink', 'mean'),
        avg_comments=('no_comment', 'mean'),
    ).reset_index()
    return agg

def build_features(iteration_df, issue_df):
    issue_features = build_issue_features(issue_df)

    df = iteration_df.merge(
        issue_features,
        on=['boardid', 'sprintid', 'org', 'snapshot'],
        how='left'
    )

    # Feature engineering
    df['scope_creep_ratio'] = df['no_issue_added'] / (df['no_issue_starttime'] + 1)
    df['removal_ratio'] = df['no_issue_removed'] / (df['no_issue_starttime'] + 1)
    df['completion_ratio'] = df['vel_done'] / (df['vel_starttime'] + 1)
    df['todo_ratio'] = df['vel_todo'] / (df['vel_starttime'] + 1)
    df['inprogress_ratio'] = df['vel_inprogress'] / (df['vel_starttime'] + 1)
    df['blocker_ratio'] = df['total_blockedby'] / (df['total_issues'] + 1)
    df['dependency_ratio'] = df['avg_issuelink']
    df['team_load'] = (df['no_issue_starttime'] + df['no_issue_added']) / (df['no_teammember'] + 1)

    # Features from snapshots 0, 30, 50 only
    df_features = df[df['snapshot'].isin([0, 30, 50])].copy()

    # Label from snapshot 80
    df80 = df[df['snapshot'] == 80][['boardid', 'sprintid', 'org', 'vel_diff']].copy()
    df80['overrun'] = (df80['vel_diff'] < 0).astype(int)
    df80 = df80.rename(columns={'vel_diff': 'vel_diff_80'})

    # Join label to earlier snapshots
    df_final = df_features.merge(
        df80[['boardid', 'sprintid', 'org', 'overrun', 'vel_diff_80']],
        on=['boardid', 'sprintid', 'org'],
        how='inner'
    )

    # Historical overrun rate from snapshot 80 only
    hist = df80.groupby('boardid')['overrun'].mean().reset_index()
    hist.columns = ['boardid', 'historical_overrun_rate']
    df_final = df_final.merge(hist, on='boardid', how='left')

    return df_final

if __name__ == "__main__":
    print("Loading data...")
    iteration_df = load_iteration_files()
    issue_df = load_issue_files()

    print("Building features...")
    df = build_features(iteration_df, issue_df)

    print(f"\nFinal dataset shape: {df.shape}")
    print(f"\nOverrun distribution:\n{df['overrun'].value_counts()}")
    print(f"\nOverrun rate: {df['overrun'].mean():.2%}")

    # Sanity check — overrun sprints should have lower completion
    print(f"\nSanity check:")
    print(df.groupby('overrun')[['completion_ratio', 'todo_ratio', 'scope_creep_ratio']].mean().round(3))

    df.to_csv("sprint_features.csv", index=False)
    print("\nSaved to sprint_features.csv")