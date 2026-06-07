import pandas as pd
import os
import glob

# Path to dataset
DATASET_PATH = "agile sprints/IEEE TSE2017/dataset"

ORGS = ["Apache", "JBoss", "JIRA", "MongoDB", "Spring"]
SNAPSHOTS = [0, 30, 50, 80]

def load_iteration_files():
    all_dfs = []
    
    for org in ORGS:
        for snapshot in SNAPSHOTS:
            file_path = os.path.join(
                DATASET_PATH, 
                org, 
                f"{org.lower()}_iteration_{snapshot}.csv"
            )
            if os.path.exists(file_path):
                df = pd.read_csv(file_path, on_bad_lines='skip', engine='python', encoding='latin-1')
                df["org"] = org
                df["snapshot"] = snapshot
                all_dfs.append(df)
                print(f"Loaded: {org} - {snapshot}% | Rows: {len(df)}")
            else:
                print(f"Missing: {file_path}")
    
    return pd.concat(all_dfs, ignore_index=True)

def load_issue_files():
    all_dfs = []
    
    for org in ORGS:
        for snapshot in SNAPSHOTS:
            file_path = os.path.join(
                DATASET_PATH,
                org,
                f"{org.lower()}_issue_{snapshot}.csv"
            )
            if os.path.exists(file_path):
                df = pd.read_csv(file_path, on_bad_lines='skip', engine='python', encoding='latin-1')
                df["org"] = org
                df["snapshot"] = snapshot
                all_dfs.append(df)
                print(f"Loaded: {org} issues - {snapshot}% | Rows: {len(df)}")
            else:
                print(f"Missing: {file_path}")
    
    return pd.concat(all_dfs, ignore_index=True)

if __name__ == "__main__":
    print("=== Loading Iteration Files ===")
    iteration_df = load_iteration_files()
    print(f"\nTotal iteration rows: {len(iteration_df)}")
    print(f"Columns: {list(iteration_df.columns)}")
    
    print("\n=== Loading Issue Files ===")
    issue_df = load_issue_files()
    print(f"\nTotal issue rows: {len(issue_df)}")
    print(f"Columns: {list(issue_df.columns)}")
    
    print("\n=== Sample Iteration Data ===")
    print(iteration_df.head())
    
    print("\n=== Null Check ===")
    print(iteration_df.isnull().sum())