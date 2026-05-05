export const MOBALYTICS_ITEMS_QUERY = `
query TheBazaarStFilterDocumentContentQuery($input: TheBazaarStructDocumentInputBySlug!) {
  game: theBazaar {
    documents {
      structDocumentBySlug(input: $input) {
        error
        data {
          id
          version
          content {
            ... on NgfDocumentCmWidgetWikiDiscoveryDetailedV1 {
              __typename
              id
              data {
                discovery {
                  cursor
                  limit
                  name
                  staticDataType
                  tags {
                    groupSlug
                    slug
                  }
                  items {
                    error
                    pageInfo {
                      cursor
                      hasMoreItems
                      total
                    }
                    documents {
                      id
                      category
                      version
                      createdAt
                      updatedAt
                      slug
                      type
                      tags {
                        data {
                          groupSlug
                          name
                          slug
                        }
                      }
                      data {
                        name
                        ... on TheBazaarWikiDocumentData {
                          staticDataEntityV2 {
                            entity {
                              ... on TheBazaarItem {
                                id
                                slug
                                icon
                                name
                                size
                                tags
                                heroes {
                                  name
                                }
                                tierStats {
                                  descriptions
                                  cooldown
                                  ammo
                                  lifesteal
                                  multicast
                                  critchance
                                  tier
                                }
                                enchantments {
                                  name
                                  descriptions
                                }
                                ammo
                                lifesteal
                                multicast
                                cooldown
                                critchance
                                descriptions
                                __typename
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`;